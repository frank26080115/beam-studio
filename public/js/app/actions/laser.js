define([
    'jquery',
    'helpers/file-system',
    'helpers/websocket',
    'helpers/api/bitmap-laser-parser',
    'helpers/api/svg-laser-parser',
    'helpers/grayscale',
    'helpers/convertToTypedArray',
    'helpers/element-angle',
    'helpers/api/control',
    'jsx!widgets/Popup',
    'freetrans',
    'helpers/jquery.box'
], function(
    $,
    fileSystem,
    WebSocket,
    bitmapLaserParser,
    svgLaserParser,
    grayScale,
    convertToTypedArray,
    elementAngle,
    control,
    popup
) {
    'use strict';

    return function(args, reactComponent) {
        args = args || {};

        var DIAMETER = 170,    // 170mm
            DELECT_KEY_CODE = 68,
            LASER_IMG_CLASS = 'img-container',
            $uploader = $('.file-importer'),
            $uploader_file_control = $uploader.find('[type="file"]'),
            $laser_platform = $('.laser-object'),
            svgLaserWebSocket = svgLaserParser(),
            PLATFORM_DIAMETER_PIXEL = $laser_platform.height(),
            $angle = $('[name="object-angle"]'),
            $pos_x = $('[name="object-pos-x"]'),
            $pos_y = $('[name="object-pos-y"]'),
            $size_w = $('[name="object-size-w"]'),
            $size_h = $('[name="object-size-h"]'),
            $btn_start = $('#btn-start'),
            $threshold = $('[name="threshold"]'),
            deleteImage = function() {
                var $img_container = $('.' + LASER_IMG_CLASS),
                    $img = $target_image.find('img');

                if (null !== $target_image) {
                    // delete svg blob from history
                    if ('svg' === reactComponent.props.file_format && true === $img.hasClass('svg')) {
                        svgLaserWebSocket.History.deleteAt($img.data('name'));

                        if (true === svgLaserWebSocket.History.isEmpty()) {
                            reactComponent.props.file_format = '';
                        }
                    }

                    $target_image.parents('.ft-container').remove();

                    if (0 === $img_container.length) {
                        $target_image = null;
                    }
                    else {
                        $target_image = $img_container[0];
                    }
                }
            },
            refreshImage = function($img) {
                var height = $img.height(),
                    width = $img.width(),
                    img = new Image(),
                    canvas = document.createElement('canvas'),
                    ctx = canvas.getContext('2d'),
                    opts = {
                        is_rgba: true,
                        threshold: parseInt($threshold.val(), 10)
                    },
                    imageData;

                img.onload = function() {
                    if (0 < width && 0 < height) {
                        ctx.drawImage(
                            img,
                            0,
                            0,
                            width,
                            height
                        );

                        imageData = ctx.createImageData(width, height);
                        imageData.data.set(convertToTypedArray(grayScale(ctx.getImageData(0, 0, width, height).data, opts), Uint8ClampedArray));

                        ctx.putImageData(imageData, 0, 0);

                        $img.attr('src', canvas.toDataURL('image/png'));
                    }
                };

                canvas.width = width;
                canvas.height = height;

                img.src = $img.data('base');
            },
            readfiles = function(files) {

                var makeObjectUrl = function(file, index, files) {
                    var extension = file.name.split('.').pop(),
                        blob,
                        url,
                        $img,
                        url_object = window.URL,
                        fileReader = new FileReader();

                    if ('string' !== typeof reactComponent.props.file_format) {
                        reactComponent.props.file_format = extension;
                    }

                    fileReader.onloadend = function(e) {

                        if ('svg' === reactComponent.props.file_format) {
                            if ('svg' === extension) {
                                $img = setupImage(extension);
                                blob = new Blob([fileReader.result], { type: 'image/svg+xml;charset=utf-8' });
                                handleSVG($img, blob);
                            }
                            else {
                                // skip
                                go_next = true;
                            }
                        }
                        else {
                            $img = setupImage(extension);
                            handleBitmap($img, file);
                        }
                    };

                    fileReader.onerror = function() {
                        // TODO: do something?
                    };

                    fileReader.readAsArrayBuffer(file);

                    if (index === files.length) {
                        reactComponent.setState({
                            step: 'start'
                        });
                    }
                },
                setupImage = function(extension) {
                    var $div = $(document.createElement('div')).addClass(LASER_IMG_CLASS),
                        img = new Image(),
                        $img = $(img),
                        instantRefresh = function(e, data) {
                            refreshObjectParams($div);
                        };

                    $img.addClass(extension);

                    $img.one('load', function() {
                        var self = this;

                        $img.width(self.naturalWidth);
                        $img.height(self.naturalHeight);

                        if (0 === self.naturalWidth || $img.width() > $laser_platform.width()) {
                            $img.width(280);
                        }

                        if (0 === self.naturalHeight || $img.height() > $laser_platform.height()) {
                            $img.height(280);
                        }

                        $div.freetrans({
                            x: $laser_platform.width() / 2 - $img.width() / 2,
                            y: $laser_platform.height() / 2 - $img.height() / 2,
                            onRotate: instantRefresh,
                            onMove: instantRefresh,
                            onScale: instantRefresh
                        });

                        $div.parent().find('.ft-controls').on('mousedown', function(e) {
                            var $self = $(e.target);

                            $('.image-active').removeClass('image-active');
                            $target_image = $self.parent().find('.' + LASER_IMG_CLASS);
                            $target_image.find('img').addClass('image-active');
                        });

                        refreshImage($img);

                        img.onload = null;

                        // set default image
                        $target_image = $div;
                    });

                    $div.append($img);
                    $laser_platform.append($div);

                    return $img;
                },
                handleSVG = function($img, blob) {
                    var opts = {},
                        name = 'svgfile-' + (new Date()).getTime(),
                        onPresetFinished = function() {
                            opts.onFinished = onUploadFinished;

                            svgLaserWebSocket.upload(name, blob, opts);
                        },
                        onUploadFinished = function(data) {
                            opts.onFinished = onGetFinished;
                            svgLaserWebSocket.get(name, opts);
                        },
                        onGetFinished = function(data) {
                            var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' }),
                                url = window.URL,
                                objectUrl = url.createObjectURL(blob);

                            // trigger the image to load
                            $img.data('base', objectUrl).data('name', name).attr('src', objectUrl).trigger('load');

                            // allow to go next svg
                            go_next = true;

                            reactComponent.setState({
                                mode: 'cut'
                            });
                        };

                    // TODO: the 'wood' should be change
                    svgLaserWebSocket.setup(0, [0, 'wood'], {
                        onFinished: onPresetFinished
                    });
                },
                handleBitmap = function($img, file) {
                    fileSystem.writeFile(
                        file,
                        {
                            onComplete: function(e, fileEntry) {
                                var name = 'bitmap-' + (new Date()).getTime();
                                $img.data('name', name).data('base', fileEntry.toURL()).attr('src', fileEntry.toURL());
                            }
                        }
                    );
                },
                is_image = function(file) {
                    var mime_type = file.type.split('/')[0];

                    return 'image' === mime_type;
                },
                index = 0,
                go_next = true,
                first_file_extension = files.item(0).name.split('.').pop(),
                timer;

                if ('svg' === first_file_extension) {
                    timer = setInterval(function() {
                        if (true === go_next) {
                            // ignore non-image file
                            if (true === is_image(files.item(index))) {
                                go_next = false;
                                makeObjectUrl(files.item(index), index + 1, files);
                            }

                            index++;
                        }

                        if (files.length === index) {
                            clearInterval(timer);
                        }
                    }, 200);
                }
                else {
                    for (var i = 0; i < files.length; i++) {
                        fileSystem.writeFile(
                            files.item(i),
                            {
                                onComplete: makeObjectUrl(files.item(i), i + 1, files)
                            }
                        );
                    }
                }

            },
            sendToBitmapAPI = function(args) {

                var laserParser = bitmapLaserParser(),
                    onSetupFinished = function() {
                        laserParser.uploadBitmap(args, {
                            onFinished: onUploadFinish
                        });
                    },
                    onUploadFinish = function() {
                        laserParser.getGCode({
                            onFinished: onGetGCodeFinished
                        });
                    },
                    onGetGCodeFinished = function(blob) {
                        var control_methods = control(printer.serial);
                        control_methods.upload(blob.size, blob);
                    };

                laserParser.setup(0, [1, 'wood'], {
                    onFinished: onSetupFinished
                });

            },
            sendToSVGAPI = function(args) {
                var laserParser = svgLaserWebSocket,
                    onComputeFinished = function() {
                        var names = [],
                            all_svg = laserParser.History.get();

                        all_svg.forEach(function(obj) {
                            names.push(obj.name);
                        });

                        laserParser.getGCode(
                            names,
                            {
                                onFinished: onGetGCodeFinished
                            }
                        );
                    },
                    onGetGCodeFinished = function(blob) {
                        var control_methods = control(printer.serial);
                        control_methods.upload(blob.size, blob);
                    };

                laserParser.compute(args, {
                    onFinished: onComputeFinished
                });

            },
            refreshObjectParams = function($el) {
                var bounds, platform_offset, el_offset, el_position;

                if (null !== $el) {
                    platform_offset = $laser_platform.box(true);
                    el_offset = $el.box(true);
                    el_position = $el.box();
                    bounds = $el.freetrans('getBounds');

                    if (0 > el_position.left) {
                        $el.freetrans({
                            x: 0,
                        });
                    }
                    if (0 > el_position.top) {
                        $el.freetrans({
                            y: 0,
                        });
                    }
                    if (platform_offset.bottom < el_offset.bottom) {
                        $el.freetrans({
                            y: el_position.top - (el_offset.bottom - platform_offset.bottom),
                        });
                    }
                    if (platform_offset.right < el_offset.right) {
                        $el.freetrans({
                            x: el_position.left - (el_offset.right - platform_offset.right),
                        });
                    }

                    el_position = $el.position();
                    $angle.val(elementAngle($el[0]));
                    $pos_x.val(el_position.left);
                    $pos_y.val(el_position.top);
                    $size_h.val(bounds.height);
                    $size_w.val(bounds.width);
                }
            },
            $target_image = null, // changing when image clicked
            printer = null,
            printer_selecting = false;

        $btn_start.on('click', function(e) {

            var $ft_controls = $laser_platform.find('.ft-controls'),
                convertToRealCoordinate = function(px, axis) {
                    var ratio = DIAMETER / PLATFORM_DIAMETER_PIXEL, // 1(px) : N(mm)
                        r = PLATFORM_DIAMETER_PIXEL / 2 * ratio,
                        mm = ratio * px - r;

                    if ('y' === axis.toLowerCase()) {
                        mm = mm * -1;
                    }

                    return mm;
                },
                getCenter = function($el) {
                    var container_offset = $laser_platform.offset(),
                        offset = $el.offset(),
                        half_width = $el.width() / 2,
                        half_height = $el.height() / 2;

                    return {
                        x: offset.left - container_offset.left + half_width,
                        y: offset.top - container_offset.top + half_height
                    };
                },
                args = [],
                doLaser = function() {
                    $ft_controls.each(function(k, el) {
                        var $el = $(el),
                            image = new Image(),
                            width = $el.width(),
                            height = $el.height(),
                            top_left = getCenter($el.find('.ft-scaler-top.ft-scaler-left')),
                            bottom_right = getCenter($el.find('.ft-scaler-bottom.ft-scaler-right')),
                            $img = $el.parents('.ft-container').find('.img-container img'),
                            sub_data = {
                                name: $img.data('name') || '',
                                width: width,
                                height: height,
                                tl_position_x: convertToRealCoordinate(top_left.x, 'x'),
                                tl_position_y: convertToRealCoordinate(top_left.y, 'y'),
                                br_position_x: convertToRealCoordinate(bottom_right.x, 'x'),
                                br_position_y: convertToRealCoordinate(bottom_right.y, 'y'),
                                rotate: (Math.PI * elementAngle(el) / 180) * -1,
                                threshold: $threshold.val()
                            },
                            canvas = document.createElement('canvas'),
                            ctx = canvas.getContext('2d'),
                            image_blobs = [];

                        canvas.width = width;
                        canvas.height = height;
                        image.src = $el.parent().find('.ft-widget img').data('base');

                        image.onload = function() {
                            ctx.drawImage(
                                image,
                                0,
                                0,
                                width,
                                height
                            );
                            sub_data.image_data = grayScale(ctx.getImageData(0, 0, width, height).data);

                            if ('svg' === reactComponent.props.file_format && true === $img.hasClass('svg')) {
                                sub_data.width = sub_data.width / $laser_platform.width() * DIAMETER;
                                sub_data.height = sub_data.height / $laser_platform.height() * DIAMETER;
                                sub_data.svg_data = svgLaserWebSocket.History.findByName($img.data('name'))[0].data;
                            }

                            args.push(sub_data);

                            if (args.length === $ft_controls.length) {
                                // sending data
                                if ('svg' === reactComponent.props.file_format) {
                                    sendToSVGAPI(args);
                                }
                                else {
                                    sendToBitmapAPI(args);
                                }
                            }
                        };
                    });
                };

            require(['jsx!views/Print-Selector'], function(view) {
                var popup_window;
                printer_selecting = true;

                popup_window = popup(
                    view,
                    {
                        getPrinter: function(auth_printer) {
                            printer = auth_printer;
                            popup_window.close();
                            doLaser();
                        }
                    }
                );
                popup_window.open({
                    onClose: function() {
                        printer_selecting = false;
                    }
                });
            });

        });

        $('.instant-change').on('focus', function(e) {
            var $self = $(e.currentTarget),
                args = {};

            $self.one('blur', function(e) {
                $self.off('change keyup');
            });

            $self.on('change keyup', function(e) {
                args[$self.data('type')] = parseInt($self.val(), 10);
                $target_image.freetrans(args);
            });
        });

        $uploader_file_control.on('change', function(e) {
            readfiles(this.files);
        });

        $uploader.on('dragover dragend', function() {
            return false;
        });

        $uploader.on('drop', function(e) {
            e.preventDefault();
            readfiles(e.originalEvent.dataTransfer.files);
        });

        $threshold.on('keyup', function(e) {
            $('.' + LASER_IMG_CLASS).find('img').each(function(k, el) {
                refreshImage($(el));
            });
        });

        $(document).on('keydown', function(e) {
            if (DELECT_KEY_CODE === e.keyCode && false === printer_selecting) {
                deleteImage();
            }
        });
    };
});