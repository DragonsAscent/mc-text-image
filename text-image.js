const imageInput = document.getElementById('image-input');
const widthIn = document.getElementById('width');
const heightIn = document.getElementById('height');
const keepRatio = document.getElementById('keep-ratio');
const pixelShape = document.getElementById('pixel-shape');
const smoothing = document.getElementById('smoothing');
const transpCutoff = document.getElementById('transparency-cutoff');
const colorTolerance = document.getElementById('color-tolerance');
const colorToleranceValue = document.getElementById('color-tolerance-value');
const colorMerge = document.getElementById('color-merge');
const colorMergeValue = document.getElementById('color-merge-value');
const stripSpace = document.getElementById('strip-space');
const outputType = document.getElementById('output-type');
const summonScale = document.getElementById('summon-scale');
const fillGaps = document.getElementById('fill-gaps');

const lengthOut = document.getElementById('length-out');
const colorTokenOut = document.getElementById('color-token-out');
const chatLimit = document.getElementById('chat-limit');
const cmdBlockLimit = document.getElementById('cmd-block-limit');
const jsonOut = document.getElementById('json-out');
const sizeOut = document.getElementById('size-out');
const canvas = document.getElementById('canvas');
const canvasOutline = document.getElementById('canvas-outline');
const originalPreview = document.getElementById('original-preview');
const versionTag = document.getElementById('version-tag');

const flagsEl = document.body;

const ctx = canvas.getContext('2d');

const imageLoader = new Image();

const APP_VERSION = 'V 2.0.2';

if (versionTag) {
    versionTag.innerText = APP_VERSION;
}


///////////////////////// EVENT LISTENERS /////////////////////////


// Image file select

function loadImage(imageFile) {
    const prevSrc = imageLoader.src;
    flagsEl.classList.remove('image-loaded');
    const nextSrc = URL.createObjectURL(imageFile);
    imageLoader.src = nextSrc;
    originalPreview.src = nextSrc;
    if (prevSrc) {
        URL.revokeObjectURL(prevSrc);
    }
}

imageInput.addEventListener('change', e => {
    loadImage(imageInput.files[0]);
});

// Image paste or drag-and-drop

function findImageTransfer(data) {
    for (const item of data.items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}

window.addEventListener('paste', e => {
    const image = findImageTransfer(e.clipboardData);
    if (image) {
        e.preventDefault();
        imageInput.value = '';
        loadImage(image);
    }
});

window.addEventListener('dragover', e => {
    const image = findImageTransfer(e.dataTransfer);
    if (image) {
        e.preventDefault();
    }
});

window.addEventListener('drop', e => {
    const image = findImageTransfer(e.dataTransfer);
    if (image) {
        e.preventDefault();
        imageInput.value = '';
        loadImage(image);
    }
});

// Image loading

imageLoader.addEventListener('error', e => {
    flagsEl.classList.remove('image-loaded');
    console.error('Failed to load image:', e);
    alert('Failed to load image!');
});

imageLoader.addEventListener('load', e => {
    flagsEl.classList.add('image-loaded');
    updateOutput();
});

// Settings

keepRatio.addEventListener('change', () => {
    if (!keepRatio.checked && flagsEl.classList.contains('image-loaded')) {
        // Changed to absolute sizing while image was loaded
        const size = calcSize(true);
        widthIn.value = size.w;
        heightIn.value = size.unscaledH;
    }
    updateOutput();
});

{
    const ONLY_DIGITS = /^\d+$/;
    
    const prevInputEventSize = {
        width: parseSize(widthIn.value),
        height: parseSize(heightIn.value),
    };

    function onSizeInput(type, input) {
        const prevValue = prevInputEventSize[type];
        const currValue = parseSize(input.value);
        
        prevInputEventSize[type] = currValue;
        
        if (ONLY_DIGITS.test(input.value) && Math.abs(currValue - prevValue) === 1) {
            // Probably caused by arrow buttons
            updateOutput();
        }
    }
    widthIn.addEventListener('input', () => onSizeInput('width', widthIn));
    heightIn.addEventListener('input', () => onSizeInput('height', heightIn));
}

{
    if (![...outputType.options].some(option => option.value === outputType.value)) {
        outputType.value = 'minimessage';
    }

    let currOutputTypeFlag = 'output-type-' + outputType.value;
    flagsEl.classList.add(currOutputTypeFlag);
    // Do not play animation when page loads
    setTimeout(() => flagsEl.classList.remove('no-transition'), 0);
    
    outputType.addEventListener('change', () => {
        flagsEl.classList.remove(currOutputTypeFlag);
        currOutputTypeFlag = 'output-type-' + outputType.value;
        flagsEl.classList.add(currOutputTypeFlag);
        updateOutput();
    });
}

summonScale.addEventListener('input', updateOutput);
colorTolerance.addEventListener('input', () => {
    colorToleranceValue.innerText = colorTolerance.value + '%';
    updateOutput();
});
colorMerge.addEventListener('input', () => {
    colorMergeValue.innerText = colorMerge.value + '%';
    updateOutput();
});

for (const el of [
    widthIn, heightIn, pixelShape, smoothing,
    transpCutoff, stripSpace, fillGaps,
]) {
    el.addEventListener('change', updateOutput);
}

// Output textarea auto-select

let doFullSelect = false;

jsonOut.addEventListener('mousedown', e => {
    const textarea = e.target.closest('textarea');
    doFullSelect = !!textarea && e.button === 0 && !e.altKey && document.activeElement !== textarea;
});

jsonOut.addEventListener('click', e => {
    const textarea = e.target.closest('textarea');
    if (textarea && e.button === 0 && !e.altKey && doFullSelect) {
        textarea.focus();
        textarea.select();
    }
});


///////////////////////// IMAGE GENERATION /////////////////////////


// Chosen to have the same width in Minecraft text.
// Minecraft's font has very stupid character widths,
// so it probably won't look good in other fonts.
const BLOCK_CHAR = '\u2587';
const SPACE_CHAR = '\u2007';
const TRAILING_SPACE = new RegExp(SPACE_CHAR + '+$');

const FONT_RATIO = 1.8;
const OUTPUT_CHUNK_SIZE = 2800;

function parseSize(text) {
    const parsed = parseInt(text);
    return (parsed > 0) ? parsed : 0;
}

function calcSize(keepRatio) {
    const origW = imageLoader.naturalWidth;
    const origH = imageLoader.naturalHeight;
    const parsedW = parseSize(widthIn.value);
    const parsedH = parseSize(heightIn.value);
    
    let w = parsedW || origW;
    let h = parsedH || origH;
    if (keepRatio) {
        const originRatio = origW / origH;
        const currRatio = w / h;
        
        if ((currRatio > originRatio) || (origH && !origW)) {
            // Too wide, or only height was specified
            // Update width from height
            w = h * origW / origH;
        } else {
            // Update height from width
            h = w * origH / origW;
        }
    }
    
    const pixelRatio = (pixelShape.value === 'font') ? FONT_RATIO : 1.0;
    
    return {
        w: Math.round(w),
        h: Math.round(h / pixelRatio),
        unscaledH: Math.round(h),
        origW, origH,
        controlW: parsedW || w,
        controlH: Math.round((parsedH || h) / pixelRatio),
    };
}

function hexNibble(value) {
    return value.toString(16).padStart(2, '0');
}

function quantizeChannel(value, step) {
    return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function getColorToleranceStep() {
    const tolerance = parseInt(colorTolerance.value) || 0;
    return 1 + Math.round((100 - tolerance) * 0.31);
}

function getColorMergeThreshold() {
    const mergeValue = parseInt(colorMerge.value) || 0;
    return Math.round(mergeValue * 1.6);
}

function rgbToHex({r, g, b}) {
    return '#' + hexNibble(r) + hexNibble(g) + hexNibble(b);
}

function parseHexColor(color) {
    return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16),
    };
}

function setPixelColor(pixels, offset, color) {
    pixels[offset + 0] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = 255;
}

function chooseMergedColor(currentColorHex, nextColorHex) {
    if (!currentColorHex || !nextColorHex || currentColorHex === nextColorHex) {
        return nextColorHex;
    }

    const threshold = getColorMergeThreshold();
    if (threshold <= 0) {
        return nextColorHex;
    }

    const currentColor = parseHexColor(currentColorHex);
    const nextColor = parseHexColor(nextColorHex);
    const diffR = currentColor.r - nextColor.r;
    const diffG = currentColor.g - nextColor.g;
    const diffB = currentColor.b - nextColor.b;
    const distance = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB);

    return distance <= threshold ? currentColorHex : nextColorHex;
}

function makeHexColor(pixels, offset, cutoff) {
    const a = pixels[offset + 3];
    if (a < cutoff) {
        // Make fully transparent
        pixels[offset + 3] = 0;
        return null;
    } else {
        // Make fully opaque
        pixels[offset + 3] = 255;
        const quantizeStep = getColorToleranceStep();
        const r = quantizeChannel(pixels[offset + 0], quantizeStep);
        const g = quantizeChannel(pixels[offset + 1], quantizeStep);
        const b = quantizeChannel(pixels[offset + 2], quantizeStep);
        const color = {r, g, b};
        setPixelColor(pixels, offset, color);
        return rgbToHex(color);
    }
}

function escapeMiniMessageText(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/</g, '\\<')
        .replace(/\n/g, '<newline>');
}

function makeMiniMessageString(json) {
    return json.map(({text, color}) =>
        `<color:${color}>${escapeMiniMessageText(text)}</color>`
    ).join('');
}

function tokenizeMiniMessageText(text) {
    return escapeMiniMessageText(text).match(/\\.|<newline>|[\s\S]/g) || [];
}

function splitMiniMessageChunks(json, maxLength = OUTPUT_CHUNK_SIZE) {
    const chunks = [];
    let currentChunk = '';
    const colorCloseTag = '</color>';

    function pushChunk() {
        if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
    }

    for (const {text, color} of json) {
        const colorTag = `<color:${color}>`;
        const tokens = tokenizeMiniMessageText(text);
        const reservedLength = colorTag.length + colorCloseTag.length;

        if (reservedLength >= maxLength) {
            continue;
        }

        let tokenIndex = 0;
        while (tokenIndex < tokens.length) {
            if (!currentChunk) {
                currentChunk = colorTag;
            } else if (currentChunk.length + reservedLength > maxLength) {
                pushChunk();
                currentChunk = colorTag;
            } else {
                currentChunk += colorTag;
            }

            while (tokenIndex < tokens.length) {
                const nextToken = tokens[tokenIndex];
                if (currentChunk.length + nextToken.length + colorCloseTag.length > maxLength) {
                    break;
                }
                currentChunk += nextToken;
                tokenIndex += 1;
            }

            currentChunk += colorCloseTag;

            if (tokenIndex < tokens.length) {
                pushChunk();
            }
        }
    }

    pushChunk();
    return chunks.length ? chunks : [''];
}

function makeJsonComponent(json) {
    if (!json.length) {
        return {text: ''};
    }

    return {
        text: '',
        extra: json,
    };
}

function splitIntoChunks(text, maxLength = OUTPUT_CHUNK_SIZE) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.slice(i, i + maxLength));
    }
    return chunks.length ? chunks : [''];
}

function calcOutputRows(text) {
    const lineCount = text.split('\n').length;
    return Math.min(12, Math.max(4, lineCount + 1));
}

async function copyChunkText(button, text) {
    const originalText = button.innerText;
    button.disabled = true;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const tempInput = document.createElement('textarea');
            tempInput.value = text;
            tempInput.setAttribute('readonly', '');
            tempInput.style.position = 'absolute';
            tempInput.style.left = '-9999px';
            document.body.append(tempInput);
            tempInput.select();
            document.execCommand('copy');
            tempInput.remove();
        }

        button.innerText = 'Copied';
    } catch (error) {
        console.error('Failed to copy chunk:', error);
        button.innerText = 'Copy failed';
    }

    window.setTimeout(() => {
        button.innerText = originalText;
        button.disabled = false;
    }, 1200);
}

function renderOutputChunks(texts) {
    jsonOut.replaceChildren();
    
    texts.forEach((text, index) => {
        const chunkWrap = document.createElement('div');
        chunkWrap.className = 'chunk-card';

        const chunkHeader = document.createElement('div');
        chunkHeader.className = 'chunk-header';
        
        const chunkLabel = document.createElement('div');
        chunkLabel.className = 'chunk-label';
        chunkLabel.innerText = `Output ${index + 1}${texts.length > 1 ? ` of ${texts.length}` : ''}`;

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'chunk-copy-button';
        copyButton.innerText = 'Copy';
        copyButton.addEventListener('click', () => {
            void copyChunkText(copyButton, text);
        });
        
        const textarea = document.createElement('textarea');
        textarea.readOnly = true;
        textarea.rows = calcOutputRows(text);
        textarea.cols = 50;
        textarea.spellcheck = false;
        textarea.value = text;
        
        chunkHeader.append(chunkLabel, copyButton);
        chunkWrap.append(chunkHeader, textarea);
        jsonOut.append(chunkWrap);
    });
}

function jsonToText(json) {
    const componentOutput = JSON.stringify(makeJsonComponent(json));
    
    if (outputType.value === 'minimessage') {
        return splitMiniMessageChunks(json);
    }
    
    if (outputType.value === 'json') {
        return splitIntoChunks(componentOutput);
    }
    
    if (outputType.value === 'snbt') {
        return splitIntoChunks(componentOutput);
    }
    
    const inputScale = parseFloat(summonScale.value);
    const scaleX = Number.isFinite(inputScale) ? inputScale : 1.0;
    const adjustRatio = (pixelShape.value === 'font') ? 1.0 : FONT_RATIO;
    const scaleY = scaleX / adjustRatio;
    
    const align = stripSpace.checked ? '"left"' : '"center"';
    // There doesn't seem to be a limit for "line_width", so just use the maximum NBT integer
    const commandPrefix = `summon minecraft:text_display ~ ~ ~ {alignment:${align},transformation:{scale:[${scaleX}f,${scaleY}f,1f],translation:[`;
    const commandSuffix = `,0f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]},line_width:2147483647,background:0,text:${componentOutput}}`;
    
    let offsets = ['0f,0f'];
    
    if (fillGaps.checked) {
        const offsetX = 0.025 * scaleX;
        const offsetY = 0.0756 * scaleY;
        offsets = [
            `0f,0f`,
            `0f,${offsetY}f`,
            `${offsetX}f,0f`,
            `${offsetX}f,${offsetY}f`,
        ];
    }
    
    return offsets.map(offset => commandPrefix + offset + commandSuffix);
}

const prevSafeInputs = {
    src: null,
    w: '100',
    h: '100',
    keepRatio: keepRatio.checked,
    pixelShape: pixelShape.value,
};
let allowGiantImage = false;

function updateOutput() {
    if (!flagsEl.classList.contains('image-loaded')) {
        return;
    }
    
    const {w, h, origW, origH, controlW, controlH} = calcSize(keepRatio.checked);
    
    canvas.width = w;
    canvas.height = h;
    if (w === origW && h === origH) {
        sizeOut.innerText = `${w}×${h}`;
    } else {
        sizeOut.innerText = `${w}×${h} (original ${origW}×${origH})`;
    }
    canvasOutline.style.width = controlW + 'px';
    canvasOutline.style.height = controlH + 'px';
    
    if (!allowGiantImage && w * h > 100000) {
        const resp = confirm(`You are trying to generate a very large image (${w} x ${h} = ${w * h} pixels), are you sure?`);
        if (!resp) {
            if (prevSafeInputs.src !== imageLoader.src) {
                // Bigness caused by new image
                widthIn.value = 100;
                heightIn.value = 100;
            } else {
                // Bigness caused by change to inputs
                widthIn.value = prevSafeInputs.w;
                heightIn.value = prevSafeInputs.h;
                keepRatio.checked = prevSafeInputs.keepRatio;
                pixelShape.value = prevSafeInputs.pixelShape;
            }
            updateOutput();
            return;
        } else {
            allowGiantImage = true;
        }
    }
    if (!allowGiantImage) {
        prevSafeInputs.src = imageLoader.src;
        prevSafeInputs.w = widthIn.value;
        prevSafeInputs.h = heightIn.value;
        prevSafeInputs.keepRatio = keepRatio.checked;
        prevSafeInputs.pixelShape = pixelShape.value;
    }
    
    if (smoothing.value) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = smoothing.value;
    } else {
        ctx.imageSmoothingEnabled = false;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imageLoader, 0, 0, w, h);
    
    const cutoff = parseInt(transpCutoff.value) || 0;
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const json = [];
    let currColor = null;
    let currText = '';
    for (let x = 0, i = 0; i < pixels.length; x++, i += 4) {
        if (x >= w) {
            if (stripSpace.checked) {
                currText = currText.replace(TRAILING_SPACE, '');
            }
            currText += '\n';
            x = 0;
        }
        const rawColor = makeHexColor(pixels, i, cutoff);
        const newColor = chooseMergedColor(currColor, rawColor);
        if (rawColor && newColor) {
            setPixelColor(pixels, i, parseHexColor(newColor));
        }
        if (currColor && newColor && currColor != newColor) {
            json.push({text: currText, color: currColor});
            currText = '';
        }
        if (newColor) {
            currColor = newColor;
            currText += BLOCK_CHAR;
        } else {
            currText += SPACE_CHAR;
        }
    }
    if (stripSpace.checked) {
        currText = currText.replace(TRAILING_SPACE, '');
    }
    if (currText && currColor) {
        json.push({text: currText, color: currColor});
    }
    
    // Apply transparency cutoff to preview
    ctx.putImageData(imageData, 0, 0);
    
    const texts = jsonToText(json);
    const colorTokenCount = json.length;
    
    let maxLength = 0;
    for (const text of texts) {
        if (text.length > maxLength) maxLength = text.length;
    }
    const maxLengthText = maxLength.toLocaleString();
    const colorTokenText = colorTokenCount.toLocaleString();
    
    if (texts.length === 1) {
        lengthOut.innerText = `${maxLengthText} chars`;
    } else if (outputType.value === 'summon') {
        lengthOut.innerText =
            `${texts.length} commands, longest ${maxLengthText} chars`;
    } else {
        lengthOut.innerText =
            `${texts.length} chunks, longest ${maxLengthText} chars`;
    }

    colorTokenOut.innerText = `${colorTokenText} color tokens`;
    
    chatLimit.classList.toggle('yes', maxLength <= 255);
    cmdBlockLimit.classList.toggle('yes', maxLength <= 32500);
    
    renderOutputChunks(texts);
}

if (imageInput.files.length) {
    // Browser has persisted values through reload
    loadImage(imageInput.files[0]);
}
