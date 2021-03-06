define([
    'Rx',
    'app/actions/beambox',
    'app/actions/beambox/beambox-preference',
    'app/actions/beambox/constant',
    'helpers/i18n'
], function (
    Rx,
    BeamboxActions,
    BeamboxPreference,
    Constant,
    i18n
) {
    const LANG = i18n.lang.beambox.left_panel;

    class PreviewModeBackgroundDrawer {
        constructor() {
            this.canvas = document.createElement('canvas');
            this.cameraCanvasUrl = '';

            this.coordinates = {
                maxX : 0,
                maxY : 0,
                minX : 10000,
                minY : 10000
            }

            this.cameraOffset = null;
        }

        start(cameraOffset) {
            this.canvas.width = Constant.dimension.getWidth();
            this.canvas.height = Constant.dimension.getHeight();

            // { x, y, angle, scaleRatioX, scaleRatioY }
            this.cameraOffset = cameraOffset;

            this.backgroundDrawerSubject = new Rx.Subject();
            this.backgroundDrawerSubject
                .concatMap(p => Rx.Observable.fromPromise(p))
                .subscribe(blob => this._drawBlobToBackground(blob));
        }

        end() {
            if (this.backgroundDrawerSubject) {
                this.backgroundDrawerSubject.onCompleted();
            }
        }

        async draw(imgUrl, x, y, last = false, callBack= () => {}) {
            const p = this._prepareCroppedAndRotatedImgBlob(imgUrl, x, y, last, callBack);

            this.backgroundDrawerSubject.onNext(p);
            // await p;  if you want to know the time when image transfer to Blob, which is almost the same time background is drawn.
        }



        drawBoundary() {
            const canvasBackground = svgedit.utilities.getElem('canvasBackground');
            const canvasGrid = svgedit.utilities.getElem('canvasGrid');
            const previewBoundary = this._getPreviewBoundary();

            canvasBackground.insertBefore(previewBoundary, canvasGrid.nextSibling);
        }

        clearBoundary() {
            const canvasBackground = svgedit.utilities.getElem('canvasBackground');
            const previewBoundary = svgedit.utilities.getElem('previewBoundary');

            if (previewBoundary) {
                canvasBackground.removeChild(previewBoundary);
            }
        }

        isClean() {
            return this.cameraCanvasUrl === '';
        }

        clear() {
            if (this.isClean()) {
                return;
            }

            window.svgCanvas.setBackground('#fff');

            // clear canvas
            this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);

            // reset cameraCanvasUrl
            URL.revokeObjectURL(this.cameraCanvasUrl);
            this.cameraCanvasUrl = '';
        }

        getCameraCanvasUrl() {
            return this.cameraCanvasUrl;
        }

        getCoordinates() {
            return this.coordinates;
        }

        resetCoordinates() {
            this.coordinates.maxX = 0;
            this.coordinates.maxY = 0;
            this.coordinates.minX = 10000;
            this.coordinates.minY = 10000;
        }

        _drawBlobToBackground(blob) {
            if (this.cameraCanvasUrl) {
                URL.revokeObjectURL(this.cameraCanvasUrl);
            }

            this.cameraCanvasUrl = URL.createObjectURL(blob);
            window.svgCanvas.setBackground('#fff', this.cameraCanvasUrl);
        }

        _prepareCroppedAndRotatedImgBlob(imgUrl, x, y, last = false, callBack = () => {}) {
            const img = new Image();
            img.src = imgUrl;

            return new Promise(resolve => {
                img.onload = () => {
                    // free unused blob memory
                    URL.revokeObjectURL(imgUrl);

                    const img_regulated = this._cropAndRotateImg(img);

                    const dstX = x - img_regulated.width/2;
                    const dstY = y - img_regulated.height/2;

                    if (dstX > this.coordinates.maxX) {
                        this.coordinates.maxX = dstX;
                    }
                    if (dstX < this.coordinates.minX) {
                        this.coordinates.minX = dstX;
                    }
                    if (dstY > this.coordinates.maxY) {
                        this.coordinates.maxY = dstY;
                    }
                    if (dstY < this.coordinates.minY) {
                        this.coordinates.minY = dstY;
                    }
                    this.canvas.getContext('2d').drawImage(img_regulated, dstX, dstY);
                    this.canvas.toBlob( (blob) => {
                        resolve(blob);
                        if (last) {
                            setTimeout(callBack, 1000);
                        }
                    });
                };
            });
        }

        _cropAndRotateImg(imageObj) {
            const {
                angle,
                scaleRatioX,
                scaleRatioY
            } = this.cameraOffset;

            const cvs = document.createElement('canvas');
            const ctx = cvs.getContext('2d');

            const a = angle;
            const w = imageObj.width;
            const h = imageObj.height;

            const l = h * scaleRatioY / (Math.cos(a) + Math.sin(a));
            cvs.width = cvs.height = l;
            ctx.translate(l/2, l/2);
            ctx.rotate(a);
            ctx.scale(scaleRatioX, scaleRatioY);
            ctx.drawImage(imageObj, -w/2, -h/2, w, h);

            return cvs;
        }

        _getPreviewBoundary() {
            const previewBoundaryId = 'previewBoundary';
            const color = 'rgba(204,204,204,0.8)';
            const stripeColor = 'rgba(102,102,102,0.8)';
            const stripeWidth = 60;
            const uncapturabledHeight = (this.cameraOffset.y * Constant.dpmm) - (Constant.camera.imgHeight * this.cameraOffset.scaleRatioY / 2);
            const svgdoc = document.getElementById('svgcanvas').ownerDocument;
            const NS = svgedit.NS;
            const boundaryGroup = svgdoc.createElementNS(NS.SVG, 'svg');
            const borderTop = svgdoc.createElementNS(NS.SVG, 'rect');
            const borderPattern = svgdoc.createElementNS(NS.SVG, 'pattern');
            const patternRect = svgdoc.createElementNS(NS.SVG, 'rect');
            const patternLine = svgdoc.createElementNS(NS.SVG, 'line');
            const descText = svgdoc.createElementNS(NS.SVG, 'text');

            svgedit.utilities.assignAttributes(boundaryGroup, {
                'id': previewBoundaryId,
                'width': '100%',
                'height': '100%',
                'viewBox': `0 0 ${Constant.dimension.getWidth()} ${Constant.dimension.getHeight()}`,
                'x': 0,
                'y': 0,
                'style': 'pointer-events:none'
            });

            svgedit.utilities.assignAttributes(borderPattern, {
                'id': 'border-pattern',
                'width': stripeWidth,
                'height': stripeWidth,
                'patternUnits': 'userSpaceOnUse',
                'patternTransform': 'rotate(45 100 100)',
                'style': 'pointer-events:none'
            });

            svgedit.utilities.assignAttributes(patternRect, {
                'id': 'pattern-rect',
                'width': stripeWidth,
                'height': stripeWidth,
                'fill': color,
                'style': 'pointer-events:none'
            });

            svgedit.utilities.assignAttributes(patternLine, {
                'id': 'pattern-line',
                'stroke': stripeColor,
                'stroke-width': stripeWidth,
                'patternUnits': 'userSpaceOnUse',
                'y2': stripeWidth,
                'style': 'pointer-events:none'
            });

            svgedit.utilities.assignAttributes(borderTop, {
                'width': Constant.dimension.getWidth(),
                'height': uncapturabledHeight,
                'x': 0,
                'y': 0,
                'fill': 'url(#border-pattern)',
                'style': 'pointer-events:none'
            });

            svgedit.utilities.assignAttributes(descText, {
                'font-size': 60,
                'x': (uncapturabledHeight - 60) / 2,
                'y': (uncapturabledHeight + 60) / 2 - 10,
                'font-weight': 'bold',
                'fill': '#fff',
                'stroke': '#666',
                'stroke-width': 5,
                'paint-order': 'stroke',
                'style': 'pointer-events:none'
            });

            const textNode = document.createTextNode(LANG.unpreviewable_area);
            descText.appendChild(textNode);

            borderPattern.appendChild(patternRect);
            borderPattern.appendChild(patternLine);

            boundaryGroup.appendChild(borderTop);
            if (BeamboxPreference.read('enable-diode')) {
                const {hybridBorder, hybridDescText} = this._getHybridModulePreviewBoundary(uncapturabledHeight);
                boundaryGroup.appendChild(hybridBorder);
                boundaryGroup.appendChild(hybridDescText);
            } else if (BeamboxPreference.read('borderless')) {
                const {openBottomBoundary, openBottomDescText} = this._getOpenBottomModulePreviewBoundary(uncapturabledHeight);
                boundaryGroup.appendChild(openBottomBoundary);
                boundaryGroup.appendChild(openBottomDescText);
            }

            boundaryGroup.appendChild(borderPattern);
            boundaryGroup.appendChild(descText);

            return boundaryGroup;
        }

        _getOpenBottomModulePreviewBoundary(uncapturabledHeight){
            const svgdoc = document.getElementById('svgcanvas').ownerDocument;
            const NS = svgedit.NS;
            const openBottomBoundary = svgdoc.createElementNS(NS.SVG, 'rect');
            const openBottomDescText = svgdoc.createElementNS(NS.SVG, 'text');
            svgedit.utilities.assignAttributes(openBottomBoundary, {
                'width': Constant.borderless.safeDistance.X * Constant.dpmm,
                'height': Constant.dimension.getHeight(),
                'x': Constant.dimension.getWidth() - Constant.borderless.safeDistance.X * Constant.dpmm,
                'y': 0,
                'fill': 'url(#border-pattern)',
                'style': 'pointer-events:none'
            });
            svgedit.utilities.assignAttributes(openBottomDescText, {
                'font-size': 60,
                'x': Constant.dimension.getWidth() -  (uncapturabledHeight - 60) / 2,
                'y': (uncapturabledHeight + 60) / 2 - 10,
                'text-anchor': 'end',
                'font-weight': 'bold',
                'fill': '#fff',
                'stroke': '#666',
                'stroke-width': 5,
                'paint-order': 'stroke',
                'style': 'pointer-events:none'
            });
            const textNode = document.createTextNode(LANG.borderless_blind_area);
            openBottomDescText.appendChild(textNode);
            return {openBottomBoundary, openBottomDescText};
        }

        _getHybridModulePreviewBoundary(uncapturabledHeight) {
            const svgdoc = document.getElementById('svgcanvas').ownerDocument;
            const NS = svgedit.NS;
            const hybridBorder = svgdoc.createElementNS(NS.SVG, 'rect');
            const hybridDescText = svgdoc.createElementNS(NS.SVG, 'text');
            svgedit.utilities.assignAttributes(hybridBorder, {
                'width': Constant.diode.safeDistance.X * Constant.dpmm,
                'height': Constant.dimension.getHeight(),
                'x': Constant.dimension.getWidth() - Constant.diode.safeDistance.X * Constant.dpmm,
                'y': 0,
                'fill': 'url(#border-pattern)',
                'style': 'pointer-events:none'
            });
            svgedit.utilities.assignAttributes(hybridDescText, {
                'font-size': 60,
                'x': Constant.dimension.getWidth() -  (uncapturabledHeight - 60) / 2,
                'y': (uncapturabledHeight + 60) / 2 - 10,
                'text-anchor': 'end',
                'font-weight': 'bold',
                'fill': '#fff',
                'stroke': '#666',
                'stroke-width': 5,
                'paint-order': 'stroke',
                'style': 'pointer-events:none'
            });
            const textNode = document.createTextNode(LANG.diode_blind_area);
            hybridDescText.appendChild(textNode);
            return {hybridBorder, hybridDescText};
        }
    }

    const instance = new PreviewModeBackgroundDrawer();

    return instance;
});
