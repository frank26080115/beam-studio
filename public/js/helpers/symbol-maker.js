/**
 * Make symbol elements for <use> element
 */
define([
    'helpers/i18n',
    'app/contexts/AlertCaller',
    'app/constants/alert-constants',
    'app/actions/progress-actions',
    'app/constants/progress-constants',
], function(
    i18n,
    Alert,
    AlertConstants,
    ProgressActions,
    ProgressConstants,
) {
    'use strict';
    let clipCount = 1;

    const makeSymbol = (elem, attrs, batchCmd, defs, type) => {
        const NS = svgedit.NS;
        const svgdoc = document.getElementById('svgcanvas').ownerDocument;
        const symbol = svgdoc.createElementNS(NS.SVG, 'symbol');
        const symbol_defs = svgdoc.createElementNS(NS.SVG, 'defs');
        const oldLinkMap = new Map();
        defs.map(def => {
            const clonedDef = def.cloneNode(true);
            const oldId = clonedDef.id;
            if (oldId) {
                const newId = 'def' + (clipCount++);
                oldLinkMap.set(oldId, newId);
                clonedDef.id = newId;
            }
            symbol_defs.appendChild(clonedDef);
        });

        symbol.appendChild(symbol_defs);

        symbol.appendChild(elem);
        function traverseForRemappingId(node) {
            if (!node.attributes) {
                return;
            }
            for (let attr of node.attributes) {
                const re = /url\(#([^)]+)\)/g;
                const linkRe = /\#(.+)/g;
                const urlMatch = attr.nodeName === 'xlink:href' ? linkRe.exec(attr.value) : re.exec(attr.value);

                if (urlMatch) {
                    const oldId = urlMatch[1];
                    if (oldLinkMap.get(oldId)) {
                        node.setAttribute(attr.nodeName, attr.value.replace('#' + oldId, '#' + oldLinkMap.get(oldId)));
                    }
                }
            }
            if (!node.childNodes) {
                return;
            }
            Array.from(node.childNodes).map( child => traverseForRemappingId(child) );
        }
        traverseForRemappingId(symbol);

        (function remapIdOfStyle(){
            Array.from(symbol_defs.childNodes).map(child => {
                if (child.tagName !== 'style') {
                    return;
                }
                const originStyle = child.innerHTML;
                const re = /url\(#([^)]+)\)/g;
                let mappedStyle = originStyle.replace(re, function replacer(match, p1, offset, string) {
                    if (oldLinkMap.get(p1)) {
                        return `url(#${oldLinkMap.get(p1)})`;
                    }
                });
                child.innerHTML = mappedStyle;
            });
        })();

        for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            symbol.setAttribute(attr.nodeName, attr.value);
        }
        symbol.id = svgCanvas.getNextId();
        if (elem.firstChild && (elem.firstChild.id || elem.firstChild.getAttributeNS(svgedit.NS.INKSCAPE, 'label'))) {
            if (elem.firstChild.getAttributeNS(svgedit.NS.INKSCAPE, 'label')) {
                let id = elem.firstChild.getAttributeNS(svgedit.NS.INKSCAPE, 'label');
                symbol.setAttribute('data-id', id);
                elem.firstChild.removeAttributeNS(svgedit.NS.INKSCAPE, 'label');
            } else {
                symbol.setAttribute('data-id', elem.firstChild.id);
            }
        }
        // If import by layer but no valid layer available, use current layer
        const drawing = svgCanvas.getCurrentDrawing();
        const currentLayerName = drawing.getCurrentLayerName();
        if (type === 'layer' && !symbol.getAttribute('data-id')) {
            symbol.setAttribute('data-id', currentLayerName);
        }
        if (elem.firstChild && elem.firstChild.getAttribute('data-color')) {
            symbol.setAttribute('data-color', elem.firstChild.getAttribute('data-color'));
        }

        svgedit.utilities.findDefs().appendChild(symbol);

        //remove invisible nodes (such as invisible layer in Illustrator)
        $(symbol).find('*').filter(function () {
            return ($(this).css('display') === 'none');
        }).remove();

        $(symbol).find('use').filter(function () {
            return $(symbol).find(svgedit.utilities.getHref(this)).length === 0;
        }).remove();

        //add prefix(which constrain css selector to symbol's id) to prevent class style pollution
        let originStyle = $(symbol).find('style').text();
        if (type === 'nolayer') {
            originStyle = originStyle.replace(/stroke[^a-zA-Z]*:[^;]*;/g,'');
            originStyle = originStyle.replace(/stroke-width[^a-zA-Z]*:[^;]*;/g,'');
        }

        const svgPixelTomm = 254 / 72; //本來 72 個點代表 1 inch, 現在 254 個點代表 1 inch.
        const unitMap = {
            'in': 25.4 * 10 / svgPixelTomm,
            'cm': 10 * 10 / svgPixelTomm,
            'mm': 10 / svgPixelTomm,
            'px': 1
        };
        const getFontSizeInPixel = (fontSizeCss) => {
            if (!isNaN(fontSizeCss)) {
                return fontSizeCss;
            }
            const unit = fontSizeCss.substr(-2);
            const num = fontSizeCss.substr(0, fontSizeCss.length-2);
            if (!unit || !unitMap[unit]) {
                return num;
            } else {
                return num * unitMap[unit];
            }
        }

        let textElems = $(symbol).find('text');
        for (let i = 0; i < textElems.length; i++) {
            // Remove text in <text> to <tspan>
            const textElem = textElems[i];
            const fontFamily = $(textElem).css('font-family');
            $(textElem).attr('font-family', fontFamily);
            const fontSize = getFontSizeInPixel($(textElem).css('font-size'));
            $(textElem).attr('font-size', fontSize);
            $(textElem).attr('stroke-width', 2);
            
            if (!$(textElem).attr('x')) {
                $(textElem).attr('x', 0);
            }
            if (!$(textElem).attr('y')) {
                $(textElem).attr('y', 0);
            }
            let texts = Array.from(textElem.childNodes).filter((child) => child.nodeType === 3);
            for (let j = texts.length - 1; j >= 0; j--) {
                let t = texts[j];
                const tspan = document.createElementNS(window.svgedit.NS.SVG, 'tspan');
                textElem.prepend(tspan);
                tspan.textContent = t.textContent;
                $(t).remove();
                $(tspan).attr({
                    'x': $(textElem).attr('x'),
                    'y': $(textElem).attr('y'),
                    'vector-effect': 'non-scaling-stroke',
                });
            }
        }
        //the regex indicate the css selector, but the selector may contain comma, so we replace it again.
        let prefixedStyle = originStyle.replace(/([^{}]+){/g, function replacer(match, p1, offset, string) {
            const prefix = '#' + symbol.id + ' ';
            match = match.replace(',', ',' + prefix);
            return prefix + match;
        });
        prefixedStyle = prefixedStyle + `
            *[data-color] ellipse[fill=none],
            *[data-color] circle[fill=none],
            *[data-color] rect[fill=none],
            *[data-color] path[fill=none],
            *[data-color] polygon[fill=none] {
                fill-opacity: 0 !important;
                stroke-width: 1px !important;
                stroke-opacity: 1 !important;
                vector-effect: non-scaling-stroke !important;
            }

            *[data-color] ellipse[stroke=none],
            *[data-color] circle[stroke=none],
            *[data-color] rect[stroke=none],
            *[data-color] path[stroke=none],
            *[data-color] polygon[stroke=none],
            *[data-color] ellipse:not([stroke]),
            *[data-color] circle:not([stroke]),
            *[data-color] rect:not([stroke]),
            *[data-color] path:not([stroke]),
            *[data-color] polygon:not([stroke]) {
                fill-opacity: 1 !important;
                stroke-width: 0 !important;
            }

            *[data-wireframe] {
                stroke-width: 1px !important;
                stroke-opacity: 1.0 !important;
                stroke-dasharray: 0 !important;
                opacity: 1 !important;
                vector-effect: non-scaling-stroke !important;
                filter: none !important;
            }

            #svg_editor:not(.color) #${symbol.id} * {
                fill-opacity: 0;
                stroke: #000 !important;
                filter: none;
                stroke-width: 1px !important;
                vector-effect: non-scaling-stroke !important;
                stroke-opacity: 1.0;
                stroke-dasharray: 0;
                opacity: 1;
                filter: none;
            }
            #${symbol.id} {
                overflow: visible;
            }

        `;

        if ($(symbol).find('style').length) {
            $(symbol).find('style').text(prefixedStyle);
        } else {
            $(symbol).find('defs').append(
                `<style>${prefixedStyle}</style>`
            );
        }

        batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(symbol));

        return symbol;
    };

    const getStrokeWidth = (imageRatio, scale) => {
        let strokeWidth = 0.8 * imageRatio / scale;
        const zoomRatio = svgCanvas.getZoom();
        strokeWidth /= zoomRatio;
        if (strokeWidth < 1.5) {
            strokeWidth = (strokeWidth / 1.5) ** (1 / 3) * 1.5;
        }
        return strokeWidth;
    };

    const sendTaskToWorker = async (data) => {
        return new Promise((resolve, reject) => {
            const path = require('path');
            const workerPath = path.join(__dirname, 'js', 'helpers', 'symbol-helper', 'image-symbol-worker.js');
            const worker = new Worker(workerPath);
            worker.postMessage(data);
            worker.onerror = (e) => console.log(e);
            worker.onmessage = (e) => {
                resolve(e.data);
                worker.terminate();
            }
        });
    };

    let requestId = 0;

    const svgToImgUrlByShadowWindow = async (data) => {
        return new Promise((resolve, reject) => {
            data.id = requestId;
            electron.ipc.once(`SVG_URL_TO_IMG_URL_DONE_${requestId}`, (sender, url) => {
                resolve(url);
            });
            electron.ipc.send('SVG_URL_TO_IMG_URL', data);
            requestId = requestId + 1 % 10000;
        });
    }

    const calculateImageRatio = (bb) => {
        const zoomRatio = Math.max(1, svgCanvas.getZoom());
        const widthRatio = Math.min(4096, $(window).width() * zoomRatio) / bb.width;
        const heightRatio = Math.min(4096, $(window).height() * zoomRatio) / bb.height;
        const imageRatio = 2 * Math.ceil(10000 * Math.min(widthRatio, heightRatio)) / 10000;
        return imageRatio;
    }

    const makeImageSymbol = async (symbol, scale=1, imageSymbol=null) => {
        const NS = svgedit.NS;
        const svgdoc = document.getElementById('svgcanvas').ownerDocument;
        return new Promise(async (resolve, reject) => {
            const tempSvg = svgdoc.createElementNS(NS.SVG, 'svg');
            const tempUse = svgdoc.createElementNS(NS.SVG, 'use');
            const tempSymbol = symbol.cloneNode(true);
            tempSvg.appendChild(tempSymbol);
            tempSvg.appendChild(tempUse);
            svgedit.utilities.setHref(tempUse, '#' + symbol.id);
            let bb = symbol.getAttribute('data-bbox');
            if (!bb) {
                const useElemForBB = svgedit.utilities.findTempUse();
                svgedit.utilities.setHref(useElemForBB, '#' + symbol.id);
                bb = useElemForBB.getBBox();
                svgedit.utilities.setHref(useElemForBB, '');
                bb.height = Math.max(1, bb.height);
                bb.width = Math.max(1, bb.width);
                const obj = {
                    x: parseFloat(bb.x.toFixed(5)),
                    y: parseFloat(bb.y.toFixed(5)),
                    width: parseFloat(bb.width.toFixed(5)),
                    height: parseFloat(bb.height.toFixed(5))
                };
                symbol.setAttribute('data-bbox', JSON.stringify(obj));
            } else {
                bb = JSON.parse(bb);
            }
            const bbObject = {x: bb.x, y: bb.y, width: bb.width, height: bb.height};
            tempSymbol.setAttribute('x', -bbObject.x);
            tempSymbol.setAttribute('y', -bbObject.y);
            const imageRatio = calculateImageRatio(bb);
            const strokeWidth = getStrokeWidth(imageRatio, scale);
            const descendants = Array.from(tempSymbol.querySelectorAll('*'));
            descendants.forEach((d) => {
                d.setAttribute('stroke-width', `${strokeWidth}px`);
                d.setAttribute('vector-effect', 'non-scaling-stroke');
            });
            const styles = Array.from(tempSymbol.querySelectorAll('style'));
            styles.forEach((styleNode) => {
                let styleText = styleNode.textContent;
                styleText = styleText.replace(/stroke-width: 1px !important;/g, `stroke-width: ${strokeWidth}px !important;`);
                styleNode.textContent = styleText;
            });
            tempUse.setAttribute('transform', `scale(${imageRatio})`);

            const svgString = new XMLSerializer().serializeToString(tempSvg);
            const svgBlob = await sendTaskToWorker({type: 'svgStringToBlob', svgString});
            const svgUrl = URL.createObjectURL(svgBlob);
            const imgWidth = Math.max(bb.width * imageRatio, 1);
            const imgHeight = Math.max(bb.height * imageRatio, 1);
            const imageUrl = await svgToImgUrlByShadowWindow({svgUrl, imgWidth, imgHeight, bb: bbObject, imageRatio, strokeWidth});
            URL.revokeObjectURL(svgUrl);
            if (!imageSymbol) {
                const image = svgdoc.createElementNS(NS.SVG, 'image');
                imageSymbol = svgdoc.createElementNS(NS.SVG, 'symbol');
                svgedit.utilities.findDefs().appendChild(imageSymbol);
                imageSymbol.appendChild(image);
                image.setAttribute('x', bb.x);
                image.setAttribute('y', bb.y);
                image.setAttribute('width', bb.width);
                image.setAttribute('height', bb.height);
                image.setAttribute('href', imageUrl);
                imageSymbol.setAttribute('overflow', 'visible');
                imageSymbol.setAttribute('id', `${symbol.id}_image`);
                imageSymbol.setAttribute('data-origin-symbol', `${symbol.id}`);
                symbol.setAttribute('data-image-symbol', `${imageSymbol.id}`);
            } else {
                const image = imageSymbol.firstChild;
                const oldImageUrl = image.getAttribute('href');
                URL.revokeObjectURL(oldImageUrl);
                image.setAttribute('href', imageUrl);
            }
            resolve(imageSymbol);
        });
    };

    const reRenderImageSymbol = async (useElement) => {
        const {width, height} = svgCanvas.getSvgRealLocation(useElement);
        const {width: origWidth, height: origHeight} = useElement.getBBox();

        const scale = Math.sqrt(width * height / (origWidth * origHeight));
        const href = svgCanvas.getHref(useElement);
        const currentSymbol = $(href)[0];
        if (currentSymbol && currentSymbol.tagName === 'symbol') {
            const origSymbolId = currentSymbol.getAttribute('data-origin-symbol');
            if (origSymbolId) {
                const origSymbol = $(`#${origSymbolId}`)[0];
                if (origSymbol && origSymbol.tagName === 'symbol') {
                    await makeImageSymbol(origSymbol, scale, currentSymbol);
                }
            }
        }
    }

    const reRenderImageSymbolArray = async (useElements) => {
        const convertAllUses = useElements.map((use) => reRenderImageSymbol(use));
        await Promise.all(convertAllUses);
    }

    const reRenderAllImageSymbol = async () => {
        const useElements = [];
        const layers = $('#svgcontent > g.layer').toArray();
        layers.forEach((layer) => {
            const uses = Array.from(layer.querySelectorAll('use'));
            useElements.push(...uses);
        });
        await reRenderImageSymbolArray(useElements);
    }

    const switchImageSymbol = (elem, shouldUseImage) => {
        let href = elem.getAttribute('xlink:href');
        if (href.endsWith('_image') && shouldUseImage) {
            console.log(`${elem.id} is already using image`);
            return;
        } else if (!href.endsWith('_image') && !shouldUseImage) {
            console.log(`${elem.id} is already using svg symbol`);
            return;
        }
        let currentSymbol = $(href);
        if (currentSymbol.length > 0 && currentSymbol[0].tagName === 'symbol') {
            currentSymbol = currentSymbol[0];
            const targetId = shouldUseImage ? currentSymbol.getAttribute('data-image-symbol') : currentSymbol.getAttribute('data-origin-symbol');
            console.log(targetId);
            if (!targetId) {
                console.warn(`Switcing failed, Unable to find target origin/image symbol ${targetId}.`);
                return;
            }
            const targetSymbol = $(`#${targetId}`);
            if (targetSymbol.length > 0 && targetSymbol[0].tagName === 'symbol') {
                elem.setAttribute('xlink:href', `#${targetId}`);
                svgCanvas.updateElementColor(elem);
            } else {
                console.warn(`Switcing failed, Unable to find symbol ${targetId}.`);
            }
        } else {
            console.warn(`Switcing failed, Unable to find Current symbol ${href}.`);
        }
    };

    const switchImageSymbolForAll = (shouldUseImage) => {
        ProgressActions.open(ProgressConstants.NONSTOP);
        const layers = $('#svgcontent > g.layer').toArray();
        layers.forEach((layer) => {
            const uses = Array.from(layer.querySelectorAll('use'));
            uses.forEach((use) => {
                switchImageSymbol(use, shouldUseImage);
            });
        });
        ProgressActions.close();
    }

    return {
        makeSymbol,
        makeImageSymbol,
        reRenderImageSymbol,
        reRenderImageSymbolArray,
        reRenderAllImageSymbol,
        switchImageSymbol,
        switchImageSymbolForAll
    }
});