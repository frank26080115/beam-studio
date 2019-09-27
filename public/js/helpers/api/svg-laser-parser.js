/**
 * API svg laser parser
 * Ref: https://github.com/flux3dp/fluxghost/wiki/websocket-svg-laser-parser
 */
define([
    'jquery',
    'app/actions/alert-actions',
    'app/actions/beambox/beambox-preference',
    'helpers/websocket',
    'helpers/convertToTypedArray',
    'helpers/data-history',
    'helpers/api/set-params',
    'helpers/i18n'
], function(
    $,
    AlertActions,
    BeamboxPreference,
    Websocket,
    convertToTypedArray,
    history,
    setParams,
    i18n
) {
    'use strict';

    // Because the preview image size is 640x640
    var MAXWIDTH = 640;

    return function(opts) {
        opts = opts || {};
        opts.type = opts.type || 'laser';

        var apiMethod = {
                laser: 'svg-laser-parser',
                svgeditor: 'svgeditor-laser-parser',
                draw: 'pen-svg-parser',
                cut: 'svg-vinyl-parser',
                mill: 'svg-vinyl-parser'
            }[opts.type],
            ws = new Websocket({
                method: apiMethod,
                onMessage: function(data) {
                    events.onMessage(data);
                },

                onError: function(data) {
                    events.onError(data);
                },

                onFatal: opts.onFatal
            }),
            uploaded_svg = [],
            lastOrder = '',
            events = {
                onMessage: function() {}
            },
            History = history(),
            goNextUpload = true,
            uploadQueue = [],
            computePreviewImageSize = function(size) {
                var height = size.height,
                    width = size.width,
                    longerSide = Math.max(width, height),
                    ratio;

                ratio = MAXWIDTH / longerSide;
                height = height * ratio;
                width = width * ratio;

                return {
                    width: width,
                    height: height
                };
            };

        return {
            connection: ws,
            History: History,
            /**
             * upload svg
             *
             * @param {ArrayObject} files - the file data that convert by File-Uploader
             *
             * @return {Promise}
             */
            upload: function(files, opts) {
                var self = this,
                    $deferred = $.Deferred(),
                    length = files.length,
                    currIndex = 0,
                    order_name = 'upload',
                    setMessages = function(file, isBroken, warningCollection) {
                        file.status = (0 < warningCollection.length ? 'bad' : 'good');
                        file.messages = warningCollection;
                        file.isBroken = isBroken;

                        return file;
                    },
                    sendFile = function(file, isEnd) {
                        var warningCollection = [];

                        events.onMessage = function(data) {

                            switch (data.status) {
                                case 'continue':
                                    ws.send(file.data);
                                    break;
                                case 'ok':
                                    self.get(file).done(function(response) {
                                        file.blob = response.blob;
                                        file.imgSize = response.size;

                                        file = setMessages(file, false, warningCollection);
                                        $deferred.notify('next');
                                    });
                                    break;
                                case 'warning':
                                    warningCollection.push(data.message);
                                    break;
                            }

                        };
                        events.onError = function(data) {
                            warningCollection.push(data.error);
                            file = setMessages(file, true, warningCollection);
                            $deferred.notify('next');
                        };
                        var args = [
                            order_name,
                            file.uploadName,
                            file.size
                        ];
                        if (opts && opts.model === 'fbb1p') {
                            args.push('-pro');
                        }
                        ws.send(args.join(' '));
                    };

                $deferred.progress(function(action) {
                    var file,
                        hasBadFiles = false;

                    if ('next' === action) {
                        file = files[currIndex];

                        if ('undefined' === typeof file) {
                            hasBadFiles = files.some(function(file) {
                                return 'bad' === file.status;
                            });
                            $deferred.resolve({files: files, hasBadFiles: hasBadFiles });
                        } else if (file.extension && 'svg' === file.extension.toLowerCase()) {
                            sendFile(file);
                            currIndex += 1;
                        } else {
                            setMessages(file, true, ['NOT_SUPPORT']);
                            currIndex += 1;
                            $deferred.notify('next');
                        }
                    }
                });

                $deferred.notify('next');

                return $deferred.promise();
            },
            /**
             * get svg
             *
             * @param {File} file - the file object
             *
             * @return {Promise}
             */
            get: function(file) {
                lastOrder = 'get';

                var $deferred = $.Deferred(),
                    args = [
                        lastOrder,
                        file.uploadName
                    ],
                    blobs = [],
                    blob,
                    total_length = 0,
                    size = {
                        height: 0,
                        width: 0
                    };

                events.onMessage = function(data) {

                    if ('continue' === data.status) {
                        total_length = data.length;
                        size.height = data.height;
                        size.width = data.width;
                    } else if (true === data instanceof Blob) {
                        blobs.push(data);
                        blob = new Blob(blobs, { type: file.type });

                        if (total_length === blob.size) {
                            History.push(file.uploadName, { size: size, blob: blob });
                            $deferred.resolve({ size: size, blob: blob });
                        }
                    }

                };

                events.onError = function(response) {
                    $deferred.reject(response);
                };

                ws.send(args.join(' '));

                return $deferred.promise();
            },
            /**
             * compute svg
             *
             * @param {ArrayObject} args - detail json object below [{}, {}, ...]
             *      {Int}   width         - width pixel
             *      {Int}   height        - height pixel
             *      {Float} tl_position_x - top left x
             *      {Float} tl_position_y - top left y
             *      {Float} br_position_x - bottom right x
             *      {Float} br_position_y - bottom right y
             *      {Float} rotate        - rotate
             *      {Int}   threshold     - threshold (0~255)
             *      {Array} image_data    - grayscale image data
             * @return {Promise}
             */
            compute: function(args) {
                var $deferred = $.Deferred(),
                    requests = [],
                    requestHeader,
                    nextData,
                    currIndex = 0,
                    sendData = (nextData) => {
                        ws.send(nextData);
                        currIndex += 1;

                        nextData = requests[currIndex];

                        if (true === nextData instanceof Uint8Array) {
                            sendData(nextData);
                        }
                    };

                lastOrder = 'compute';

                args.forEach(function(obj) {
                    requestHeader = [
                        lastOrder,
                        obj.name,
                        obj.real_width,
                        obj.real_height,
                        obj.tl_position_x,
                        obj.tl_position_y,
                        obj.br_position_x,
                        obj.br_position_y,
                        obj.rotate,
                        obj.svg_data.blob.size,
                        parseInt(obj.width, 10),
                        parseInt(obj.height, 10)
                    ];

                    requests.push(requestHeader.join(' '));
                    requests.push(obj.svg_data.blob);
                    requests.push(convertToTypedArray(obj.image_data, Uint8Array));
                });

                events.onMessage = function(data) {
                    switch (data.status) {
                    case 'continue':
                    case 'ok':
                        $deferred.notify('next');
                        break;
                    default:
                        // TODO: do something?
                        break;
                    }
                };

                $deferred.progress((action) => {
                    nextData = requests[currIndex];

                    if ('next' === action && 'undefined' !== typeof nextData) {
                        sendData(nextData);
                    }
                    else {
                        $deferred.resolve();
                    }
                });

                $deferred.notify('next');

                return $deferred.promise();
            },
            getTaskCode: function(names, opts) {
                opts = opts || {};
                opts.onProgressing = opts.onProgressing || function() {};
                opts.onFinished = opts.onFinished || function() {};
                lastOrder = 'getTaskCode';

                var args = [
                        'go',
                        names.join(' '),
                        opts.fileMode || '-f'
                    ],
                    blobs = [],
                    duration,
                    total_length = 0,
                    blob;

                if (opts.model === 'fbb1p') {
                    args.push('-pro');
                }

                if (window.svgCanvas && svgCanvas.getRotaryMode()) {
                    args.push('-spin');
                    args.push(svgCanvas.runExtensions('getRotaryAxisAbsoluteCoord'));
                }

                events.onMessage = function(data) {

                    if ('computing' === data.status) {
                        opts.onProgressing(data);
                    } else if ('complete' === data.status) {
                        total_length = data.length;
                        duration = data.time + 1;
                    } else if (true === data instanceof Blob) {
                        blobs.push(data);
                        blob = new Blob(blobs);

                        if (total_length === blob.size) {
                            opts.onFinished(blob, args[2], duration);
                        }
                    }

                };

                let loop_compensation = Number(localStorage.getItem('loop_compensation') || '0');
                if (loop_compensation > 0) {
                    ws.send(['set_params', 'loop_compensation', loop_compensation].join(' '));    
                }
                ws.send(args.join(' '));
            },
            divideSVG: function() {
                var $deferred = $.Deferred();
                opts = opts || {};
                opts.onProgressing = opts.onProgressing || function() {};
                opts.onFinished = opts.onFinished || function() {};
                lastOrder = 'divideSVG';

                var args = ['divide_svg'],
                    blobs = [],
                    duration,
                    currentLength = 0,
                    finalBlobs = {},
                    currentName = '';

                events.onMessage = function(data) {
                    if (data.name) {
                        currentName = data.name;
                        currentLength = data.length;
                        if (currentName == 'bitmap') {
                            finalBlobs["bitmap_offset"] = data.offset;
                        }
                    } else if (data instanceof Blob) {
                        blobs.push(data);
                        var blob = new Blob(blobs);

                        if (currentLength === blob.size) {
                            blobs = [];
                            finalBlobs[currentName] = blob;
                        }
                    } else if (data.status === 'ok') {
                        $deferred.resolve(finalBlobs);
                    } else if (data.status === 'Error') {
                        $('#dialog_box').hide();
                        AlertActions.showPopupError('', data.message);
                    }

                };

                ws.send(args.join(' '));
                return $deferred.promise();
            },
            uploadPlainSVG: function(file) {
                var $deferred = $.Deferred();

                events.onMessage = function(data) {
                    switch (data.status) {
                        case 'continue':
                            ws.send(file);
                            break;
                        case 'ok':
                            $deferred.resolve('ok');
                            break;
                        case 'warning':
                            warningCollection.push(data.message);
                            break;
                    }
                };

                events.onError = function(data) {
                    alert(data);
                };
                function getBasename(path) {
                    const pathMatch = path.match(/(.+)[\/\\].+/);
                    if (pathMatch[1]) return pathMatch[1];
                    return "";
                }
                var reader = new FileReader();
                reader.onloadend = function (e) {
                    let svgString = e.target.result;
                    const matchImages = svgString.match(/<image[^>]+>/g);
                    let allImageValid = true;
                    if (matchImages) {
                        const fs = require('fs');
                        const path = require('path');
                        const basename = getBasename(file.path);
                        for (let i = 0; i < matchImages.length; i++) {
                            let origPath = matchImages[i].match(/xlink:href="[^"]+"/);
                            if (!origPath) {
                                continue;
                            }
                            origPath = origPath[0];
                            origPath = origPath.substring(12, origPath.length - 1);
                            if (origPath.substring(0, 10) === 'data:image') {
                                continue;
                            }
                            let newPath = origPath.replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
                            // Test Abosulte Path
                            if (fs.existsSync(newPath)) {
                                continue;
                            }
                            // Test Relative Path
                            if (file.path) {
                                newPath = path.join(basename, newPath);
                                if (fs.existsSync(newPath)) {
                                    newPath = newPath.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;').replace(/>/g, '&gt;').replace(/</g, '&lt;');
                                    svgString = svgString.replace(`xlink:href="${origPath}"`, `xlink:href="${newPath}"`);
                                    continue;
                                }
                            }
                            allImageValid = false;
                            $deferred.resolve('invalid_path');
                        }
                    }
                    let version;
                    const LANG = i18n.lang.beambox.popup;
                    if (BeamboxPreference.read('svg_version_warning') !== false) {
                        const matchSVG = svgString.match(/<svg[^>]*>/g)[0];
                        version = matchSVG.match(/version="[^"]+"/);
                        if (version) {
                            version = version[0].substring(9, version[0].length -1);
                            if (version === '1.1') {
                                AlertActions.showPopupCheckboxWarning(
                                    'svg 1.1 warning',
                                    LANG.svg_1_1_waring,
                                    '',
                                    LANG.dont_show_again,
                                    () => {BeamboxPreference.write('svg_version_warning', false)}
                                );
                            }
                        }
                    }

                    if (allImageValid) {
                        file = new Blob([svgString], {
                            type: 'text/plain'
                        });

                        ws.send([
                            'upload_plain_svg',
                            encodeURIComponent(file.name),
                            file.size
                        ].join(' '));
                    }
                };
                reader.readAsText(file);

                return $deferred.promise();
            },
            uploadPlainTextSVG: function($textElement, bbox) {
                var $deferred = $.Deferred();

                events.onMessage = function(data) {
                switch (data.status) {
                    case 'continue':
                        ws.send(file);
                        break;
                    case 'ok':
                        $deferred.resolve('ok');
                        break;
                    case 'warning':
                        warningCollection.push(data.message);
                        break;
                    }
                };

                events.onError = function(data) {
                    alert(data);
                };
                const textString = $textElement.prop('outerHTML');
                let svgString = `<svg viewBox="${0} ${0} ${bbox.x + 300} ${bbox.y + 0.3 * bbox.height + 300}">
                    ${textString}
                </svg>`
                console.log(svgString)
                let file = new Blob([svgString], {
                    type: 'text/plain'
                });
                ws.send([
                    'upload_plain_svg',
                    encodeURIComponent(file.name),
                    file.size
                ].join(' '));
                return $deferred.promise();
            },
                
            uploadToSvgeditorAPI: function(files, opts) {
                var $deferred = $.Deferred(),
                    currIndex = 0,
                    order_name = 'svgeditor_upload',
                    setMessages = function(file, isBroken, warningCollection) {
                        file.status = (0 < warningCollection.length ? 'bad' : 'good');
                        file.messages = warningCollection;
                        file.isBroken = isBroken;

                        return file;
                    },

                    sendFile = function(file, isEnd) {
                        var warningCollection = [];

                        events.onMessage = function(data) {
                            switch (data.status) {
                                case 'computing':
                                    opts.onProgressing(data);
                                    break;
                                case 'continue':
                                    ws.send(file.data);
                                    break;
                                case 'ok':
                                    opts.onFinished();
                                    $deferred.resolve();
                                    break;
                                case 'warning':
                                    warningCollection.push(data.message);
                                    break;
                            }
                        };

                        events.onError = function(data) {
                            warningCollection.push(data.error);
                            file = setMessages(file, true, warningCollection);
                            $deferred.notify('next');
                        };
                        var args = [
                            order_name,
                            file.uploadName,
                            file.size,
                            file.thumbnailSize
                        ];

                        if (opts) {
                            switch (opts.model) {
                                case 'fbb1p':
                                    args.push('-pro');
                                    break;
                                case 'fbm1':
                                    args.push('-beamo');
                                    break;
                            }
                            switch (opts.engraveDpi) {
                                case 'low':
                                    args.push('-ldpi');
                                    break;
                                case 'medium':
                                    args.push('-mdpi');
                                    break;
                                case 'high':
                                    args.push('-hdpi');
                                    break;
                            }
                            if (opts.enableMask) {
                                args.push('-mask');
                            }
                        }
                        ws.send(args.join(' '));
                    };

                $deferred.progress(function(action) {
                    var file,
                        hasBadFiles = false;

                    if ('next' === action) {
                        file = files[currIndex];

                        if ('undefined' === typeof file) {
                            hasBadFiles = files.some(function(file) {
                                return 'bad' === file.status;
                            });
                            $deferred.resolve({files: files, hasBadFiles: hasBadFiles });
                        } else if (file.extension && 'svg' === file.extension.toLowerCase()) {
                            sendFile(file);
                            currIndex += 1;
                            console.log('currIndex', currIndex)
                        } else {
                            setMessages(file, true, ['NOT_SUPPORT']);
                            currIndex += 1;
                            $deferred.notify('next');
                        }
                    }
                });

                $deferred.notify('next');

                return $deferred.promise();
            },

            params: setParams(ws, events),
            computePreviewImageSize: computePreviewImageSize
        };
    };
});
