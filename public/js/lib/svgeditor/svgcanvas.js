/*globals $, svgedit, svgCanvas, jsPDF*/
/*jslint vars: true, eqeq: true, todo: true, bitwise: true, continue: true, forin: true */
/*
 * svgcanvas.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Alexis Deveria
 * Copyright(c) 2010 Pavol Rusnak
 * Copyright(c) 2010 Jeff Schiller
 *
 */

// Dependencies:
// 1) jQuery
// 2) pathseg.js
// 3) browser.js
// 4) svgtransformlist.js
// 5) math.js
// 6) units.js
// 7) svgutils.js
// 8) sanitize.js
// 9) history.js
// 10) select.js
// 11) draw.js
// 12) path.js
// 13) coords.js
// 14) recalculate.js

define([
    'helpers/i18n',
    'app/actions/beambox/beambox-preference',
    'app/actions/alert-actions',
    'jsx!app/actions/beambox/Object-Panels-Controller',
    'app/actions/beambox/preview-mode-controller',
    'app/actions/beambox',
    'app/actions/beambox/constant',
    'helpers/shortcuts',
    'lib/svgeditor/imagetracer'
], function (
    i18n,
    BeamboxPreference,
    AlertActions,
    ObjectPanelsController,
    PreviewModeController,
    BeamboxActions,
    Constant,
    shortcuts,
    ImageTracer
) {
    const LANG = i18n.lang.beambox;
    // Class: SvgCanvas
    // The main SvgCanvas class that manages all SVG-related functions
    //
    // Parameters:
    // container - The container HTML element that should hold the SVG root element
    // config - An object that contains configuration data
    $.SvgCanvas = function (container, config) {
        // Alias Namespace constants
        var NS = svgedit.NS;

        // Default configuration options
        var curConfig = {
            show_outside_canvas: true,
            selectNew: true,
            dimensions: [640, 480]
        };

        // Update config with new one if given
        if (config) {
            $.extend(curConfig, config);
        }

        // Array with width/height of canvas
        var dimensions = curConfig.dimensions;

        var canvas = this;

        // "document" element associated with the container (same as window.document using default svg-editor.js)
        // NOTE: This is not actually a SVG document, but a HTML document.
        var svgdoc = container.ownerDocument;

        // This is a container for the document being edited, not the document itself.
        var svgroot = svgdoc.importNode(svgedit.utilities.text2xml(
            '<svg id="svgroot" xmlns="' + NS.SVG + '" xlinkns="' + NS.XLINK + '" ' +
            'width="' + dimensions[0] + '" height="' + dimensions[1] + '" x="' + dimensions[0] + '" y="' + dimensions[1] + '" overflow="visible">' +
            '<defs>' +
            '<filter id="canvashadow" filterUnits="objectBoundingBox">' +
            '<feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>' +
            '<feOffset in="blur" dx="5" dy="5" result="offsetBlur"/>' +
            '<feMerge>' +
            '<feMergeNode in="offsetBlur"/>' +
            '<feMergeNode in="SourceGraphic"/>' +
            '</feMerge>' +
            '</filter>' +
            //(BeamboxPreference.read('enable_mask') ? ('<clipPath id="scene_mask"><rect x="0" y="0" width="' + dimensions[0] + '" height="' + dimensions[1] + '" /></clipPath>') : '') + 
            '</defs>' +
            '</svg>').documentElement, true);
        container.appendChild(svgroot);

        // The actual element that represents the final output SVG element
        var svgcontent = svgdoc.createElementNS(NS.SVG, 'svg');

        // This function resets the svgcontent element while keeping it in the DOM.
        var clearSvgContentElement = canvas.clearSvgContentElement = function () {
            while (svgcontent.firstChild) {
                svgcontent.removeChild(svgcontent.firstChild);
            }

            // TODO: Clear out all other attributes first?
            $(svgcontent).attr({
                id: 'svgcontent',
                width: dimensions[0],
                height: dimensions[1],
                x: dimensions[0],
                y: dimensions[1],
                overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden',
                xmlns: NS.SVG,
                'xmlns:se': NS.SE,
                'xmlns:xlink': NS.XLINK
            }).appendTo(svgroot);

        };
        clearSvgContentElement();

        // Prefix string for element IDs
        var idprefix = 'svg_';

        // Function: setIdPrefix
        // Changes the ID prefix to the given value
        //
        // Parameters:
        // p - String with the new prefix
        canvas.setIdPrefix = function (p) {
            idprefix = p;
        };

        // Current svgedit.draw.Drawing object
        // @type {svgedit.draw.Drawing}
        canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent, idprefix);

        // Function: getCurrentDrawing
        // Returns the current Drawing.
        // @return {svgedit.draw.Drawing}
        var getCurrentDrawing = canvas.getCurrentDrawing = function () {
            return canvas.current_drawing_;
        };

        // Float displaying the current zoom level (1 = 100%, .5 = 50%, etc)
        var current_zoom = 1;

        // pointer to current group (for in-group editing)
        var current_group = null;

        // Object containing data for the currently selected styles
        var all_properties = {
            shape: {
                fill: (curConfig.initFill.color === 'none' ? '' : '#') + curConfig.initFill.color,
                fill_paint: null,
                fill_opacity: curConfig.initFill.opacity,
                stroke: '#' + curConfig.initStroke.color,
                stroke_paint: null,
                stroke_opacity: curConfig.initStroke.opacity,
                stroke_width: curConfig.initStroke.width,
                stroke_dasharray: 'none',
                stroke_linejoin: 'miter',
                stroke_linecap: 'butt',
                opacity: curConfig.initOpacity
            }
        };

        all_properties.text = $.extend(true, {}, all_properties.shape);
        $.extend(all_properties.text, {
            fill: curConfig.text.fill,
            fill_opacity: curConfig.text.fill_opacity,
            stroke_width: curConfig.text.stroke_width,
            font_size: curConfig.text.font_size,
            font_family: curConfig.text.font_family
        });

        // Current shape style properties
        var cur_shape = all_properties.shape;

        // Array with all the currently selected elements
        // default size of 1 until it needs to grow bigger
        var selectedElements = [];
        let tempGroup = false;

        // Function: addSvgElementFromJson
        // Create a new SVG element based on the given object keys/values and add it to the current layer
        // The element will be ran through cleanupElement before being returned
        //
        // Parameters:
        // data - Object with the following keys/values:
        // * element - tag name of the SVG element to create
        // * attr - Object with attributes key-values to assign to the new element
        // * curStyles - Boolean indicating that current style attributes should be applied first
        // * children - Optional array with data objects to be added recursively as children
        //
        // Returns: The new element
        var addSvgElementFromJson = this.addSvgElementFromJson = function (data) {
            if (typeof (data) === 'string') {return svgdoc.createTextNode(data);}

            var shape = svgedit.utilities.getElem(data.attr.id);
            // if shape is a path but we need to create a rect/ellipse, then remove the path
            var current_layer = getCurrentDrawing().getCurrentLayer();
            if (shape && data.element !== shape.tagName) {
                current_layer.removeChild(shape);
                shape = null;
            }
            if (!shape) {
                shape = svgdoc.createElementNS(NS.SVG, data.element);
                if (current_layer) {
                    (current_group || current_layer).appendChild(shape);
                }
            }
            if (data.curStyles) {
                svgedit.utilities.assignAttributes(shape, {
                    'fill': cur_shape.fill,
                    'stroke': cur_shape.stroke,
                    'stroke-width': cur_shape.stroke_width,
                    'stroke-dasharray': cur_shape.stroke_dasharray,
                    'stroke-linejoin': cur_shape.stroke_linejoin,
                    'stroke-linecap': cur_shape.stroke_linecap,
                    'stroke-opacity': cur_shape.stroke_opacity,
                    'fill-opacity': cur_shape.fill_opacity,
                    'opacity': cur_shape.opacity / 2,
                    'style': 'pointer-events:inherit'
                }, 100);
            }
            svgedit.utilities.assignAttributes(shape, data.attr, 100);
            svgedit.utilities.assignAttributes(shape, {
                'vector-effect': 'non-scaling-stroke'
            }, 100);
            svgedit.utilities.cleanupElement(shape);

            // Children
            if (data.children) {
                data.children.forEach(function (child) {
                    shape.appendChild(addSvgElementFromJson(child));
                });
            }

            return shape;
        };

        // import svgtransformlist.js
        var getTransformList = canvas.getTransformList = svgedit.transformlist.getTransformList;

        // import from math.js.
        var transformPoint = svgedit.math.transformPoint;
        var matrixMultiply = canvas.matrixMultiply = svgedit.math.matrixMultiply;
        var hasMatrixTransform = canvas.hasMatrixTransform = svgedit.math.hasMatrixTransform;
        var transformListToTransform = canvas.transformListToTransform = svgedit.math.transformListToTransform;
        var snapToAngle = svgedit.math.snapToAngle;
        var getMatrix = svgedit.math.getMatrix;

        // initialize from units.js
        // send in an object implementing the ElementContainer interface (see units.js)
        svgedit.units.init({
            getBaseUnit: function () {
                return curConfig.baseUnit;
            },
            getElement: svgedit.utilities.getElem,
            getHeight: function () {
                return svgcontent.getAttribute('height') / current_zoom;
            },
            getWidth: function () {
                return svgcontent.getAttribute('width') / current_zoom;
            },
            getRoundDigits: function () {
                return save_options.round_digits;
            }
        });
        // import from units.js
        var convertToNum = canvas.convertToNum = svgedit.units.convertToNum;

        // import from svgutils.js
        svgedit.utilities.init({
            getDOMDocument: function () {
                return svgdoc;
            },
            getDOMContainer: function () {
                return container;
            },
            getSVGRoot: function () {
                return svgroot;
            },
            // TODO: replace this mostly with a way to get the current drawing.
            getSelectedElements: function () {
                return selectedElements;
            },
            getSVGContent: function () {
                return svgcontent;
            },
            getBaseUnit: function () {
                return curConfig.baseUnit;
            },
            getSnappingStep: function () {
                return curConfig.snappingStep;
            }
        });
        var findDefs = canvas.findDefs = svgedit.utilities.findDefs;
        var getUrlFromAttr = canvas.getUrlFromAttr = svgedit.utilities.getUrlFromAttr;
        var getHref = canvas.getHref = svgedit.utilities.getHref;
        var setHref = canvas.setHref = svgedit.utilities.setHref;
        var getPathBBox = svgedit.utilities.getPathBBox;
        var getBBox = canvas.getBBox = svgedit.utilities.getBBox;
        var getRotationAngle = canvas.getRotationAngle = svgedit.utilities.getRotationAngle;
        var getElem = canvas.getElem = svgedit.utilities.getElem;
        var getRefElem = canvas.getRefElem = svgedit.utilities.getRefElem;
        var assignAttributes = canvas.assignAttributes = svgedit.utilities.assignAttributes;
        var cleanupElement = this.cleanupElement = svgedit.utilities.cleanupElement;

        // import from coords.js
        svgedit.coords.init({
            getDrawing: function () {
                return getCurrentDrawing();
            },
            getGridSnapping: function () {
                return curConfig.gridSnapping;
            }
        });
        var remapElement = this.remapElement = svgedit.coords.remapElement;

        // import from recalculate.js
        svgedit.recalculate.init({
            getSVGRoot: function () {
                return svgroot;
            },
            getStartTransform: function () {
                return startTransform;
            },
            setStartTransform: function (transform) {
                startTransform = transform;
            }
        });
        var recalculateDimensions = this.recalculateDimensions = svgedit.recalculate.recalculateDimensions;

        // import from sanitize.js
        var nsMap = svgedit.getReverseNS();
        var sanitizeSvg = canvas.sanitizeSvg = svgedit.sanitize.sanitizeSvg;

        // import from history.js
        var MoveElementCommand = svgedit.history.MoveElementCommand;
        var InsertElementCommand = svgedit.history.InsertElementCommand;
        var RemoveElementCommand = svgedit.history.RemoveElementCommand;
        var ChangeElementCommand = svgedit.history.ChangeElementCommand;
        var BatchCommand = svgedit.history.BatchCommand;
        var call;
        // Implement the svgedit.history.HistoryEventHandler interface.
        canvas.undoMgr = new svgedit.history.UndoManager({
            handleHistoryEvent: function (eventType, cmd) {
                var EventTypes = svgedit.history.HistoryEventTypes;
                // TODO: handle setBlurOffsets.
                if (eventType === EventTypes.BEFORE_UNAPPLY || eventType === EventTypes.BEFORE_APPLY) {
                    canvas.clearSelection();
                } else if (eventType === EventTypes.AFTER_APPLY || eventType === EventTypes.AFTER_UNAPPLY) {
                    var elems = cmd.elements();
                    canvas.pathActions.clear();
                    call('changed', elems);
                    var cmdType = cmd.type();
                    var isApply = (eventType === EventTypes.AFTER_APPLY);
                    if (cmdType === MoveElementCommand.type()) {
                        var parent = isApply ? cmd.newParent : cmd.oldParent;
                        if (parent === svgcontent) {
                            canvas.identifyLayers();
                        }
                    } else if (cmdType === InsertElementCommand.type() ||
                        cmdType === RemoveElementCommand.type()) {
                        if (cmd.parent === svgcontent) {
                            canvas.identifyLayers();
                        }
                        if (cmdType === InsertElementCommand.type()) {
                            if (isApply) {
                                restoreRefElems(cmd.elem);
                            }
                        } else {
                            if (!isApply) {
                                restoreRefElems(cmd.elem);
                            }
                        }
                        if (cmd.elem.tagName === 'use') {
                            setUseData(cmd.elem);
                        }
                    } else if (cmdType === ChangeElementCommand.type()) {
                        // if we are changing layer names, re-identify all layers
                        if (cmd.elem.tagName === 'title' && cmd.elem.parentNode.parentNode === svgcontent) {
                            canvas.identifyLayers();
                        }
                        var values = isApply ? cmd.newValues : cmd.oldValues;
                        // If stdDeviation was changed, update the blur.
                        if (values.stdDeviation) {
                            canvas.setBlurOffsets(cmd.elem.parentNode, values.stdDeviation);
                        }
                        // This is resolved in later versions of webkit, perhaps we should
                        // have a featured detection for correct 'use' behavior?
                        // ——————————
                        // Remove & Re-add hack for Webkit (issue 775)
                        //if (cmd.elem.tagName === 'use' && svgedit.browser.isWebkit()) {
                        //	var elem = cmd.elem;
                        //	if (!elem.getAttribute('x') && !elem.getAttribute('y')) {
                        //		var parent = elem.parentNode;
                        //		var sib = elem.nextSibling;
                        //		parent.removeChild(elem);
                        //		parent.insertBefore(elem, sib);
                        //	}
                        //}
                    }
                }
            }
        });
        var addCommandToHistory = function (cmd) {
            canvas.undoMgr.addCommandToHistory(cmd);
        };

        /**
         * Get a HistoryRecordingService.
         * @param {svgedit.history.HistoryRecordingService=} hrService - if exists, return it instead of creating a new service.
         * @returns {svgedit.history.HistoryRecordingService}
         */
        function historyRecordingService(hrService) {
            return hrService ? hrService : new svgedit.history.HistoryRecordingService(canvas.undoMgr);
        }

        // import from select.js
        svgedit.select.init(curConfig, {
            createSVGElement: function (jsonMap) {
                return canvas.addSvgElementFromJson(jsonMap);
            },
            svgRoot: function () {
                return svgroot;
            },
            svgContent: function () {
                return svgcontent;
            },
            currentZoom: function () {
                return current_zoom;
            },
            // TODO(codedread): Remove when getStrokedBBox() has been put into svgutils.js.
            getStrokedBBox: function (elems) {
                return canvas.getStrokedBBox([elems]);
            }
        });
        // this object manages selectors for us
        var selectorManager = this.selectorManager = svgedit.select.getSelectorManager();

        // Import from path.js
        svgedit.path.init({
            getCurrentZoom: function () {
                return current_zoom;
            },
            getSVGRoot: function () {
                return svgroot;
            }
        });

        // Interface strings, usually for title elements
        var uiStrings = {
            exportNoBlur: 'Blurred elements will appear as un-blurred',
            exportNoforeignObject: 'foreignObject elements will not appear',
            exportNoDashArray: 'Strokes will appear filled',
            exportNoText: 'Text may not appear as expected'
        };

        var visElems = 'a,circle,ellipse,foreignObject,g,image,line,path,polygon,polyline,rect,svg,text,tspan,use';
        var ref_attrs = ['clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke'];

        var elData = $.data;

        // Animation element to change the opacity of any newly created element
        var opac_ani = document.createElementNS(NS.SVG, 'animate');
        $(opac_ani).attr({
            attributeName: 'opacity',
            begin: 'indefinite',
            dur: 1,
            fill: 'freeze'
        }).appendTo(svgroot);

        var restoreRefElems = function (elem) {
            // Look for missing reference elements, restore any found
            var o, i, l,
                attrs = $(elem).attr(ref_attrs);
            for (o in attrs) {
                var val = attrs[o];
                if (val && val.indexOf('url(') === 0) {
                    var id = svgedit.utilities.getUrlFromAttr(val).substr(1);
                    var ref = getElem(id);
                    if (!ref) {
                        svgedit.utilities.findDefs().appendChild(removedElements[id]);
                        delete removedElements[id];
                    }
                }
            }

            var childs = elem.getElementsByTagName('*');

            if (childs.length) {
                for (i = 0, l = childs.length; i < l; i++) {
                    restoreRefElems(childs[i]);
                }
            }
        };

        // Object to contain image data for raster images that were found encodable
        var encodableImages = {},

            // String with image URL of last loadable image
            last_good_img_url = curConfig.imgPath + 'logo.png',

            // Array with current disabled elements (for in-group editing)
            disabled_elems = [],

            // Object with save options
            save_options = {
                round_digits: 5
            },

            // Boolean indicating whether or not a dragging action has been started
            started = false,

            // String with an element's initial transform attribute value
            startTransform = null,

            // String indicating the current editor mode
            current_mode = 'select',

            // String with the current direction in which an element is being resized
            current_resize_mode = 'none',

            // Object with IDs for imported files, to see if one was already added
            import_ids = {},

            // Current text style properties
            cur_text = all_properties.text,

            // Current general properties
            cur_properties = cur_shape,

            // Array with selected elements' Bounding box object
            //	selectedBBoxes = new Array(1),

            // The DOM element that was just selected
            justSelected = null,

            // DOM element for selection rectangle drawn by the user
            rubberBox = null,

            // Array of current BBoxes, used in getIntersectionList().
            curBBoxes = [],

            // Object to contain all included extensions
            extensions = {},

            // Canvas point for the most recent right click
            lastClickPoint = null,

            // Map of deleted reference elements
            removedElements = {},

            justClearSelection = false,

            // Rotary Mode
            rotaryMode = BeamboxPreference.read('rotary_mode');

        this.isUseLayerColor = BeamboxPreference.read('use_layer_color');
        require('electron').remote.Menu.getApplicationMenu().items.filter(i => i.id === '_view')[0]
        .submenu.items.filter(i => i.id === 'SHOW_LAYER_COLOR')[0].checked = this.isUseLayerColor;
        BeamboxPreference.write('borderless', false);
        // Clipboard for cut, copy&pasted elements
        canvas.clipBoard = [];

        // Should this return an array by default, so extension results aren't overwritten?
        var runExtensions = this.runExtensions = function (action, vars, returnArray) {
            var result = returnArray ? [] : false;
            $.each(extensions, function (name, opts) {
                if (opts && action in opts) {
                    if (returnArray) {
                        result.push(opts[action](vars));
                    } else {
                        result = opts[action](vars);
                    }
                }
            });
            return result;
        };

        // Function: addExtension
        // Add an extension to the editor
        //
        // Parameters:
        // name - String with the ID of the extension
        // ext_func - Function supplied by the extension with its data
        this.importIds = function () {
            return import_ids;
        };

        this.addExtension = function (name, ext_func) {
            var ext;
            if (!(name in extensions)) {
                // Provide private vars/funcs here. Is there a better way to do this?
                if ($.isFunction(ext_func)) {
                    ext = ext_func($.extend(canvas.getPrivateMethods(), {
                        svgroot: svgroot,
                        svgcontent: svgcontent,
                        nonce: getCurrentDrawing().getNonce(),
                        selectorManager: selectorManager,
                        ObjectPanelsController: ObjectPanelsController
                    }));
                } else {
                    ext = ext_func;
                }
                extensions[name] = ext;
                call('extension_added', ext);
            } else {
                console.log('Cannot add extension "' + name + '", an extension by that name already exists.');
            }
        };

        // This method rounds the incoming value to the nearest value based on the current_zoom
        var round = this.round = function (val) {
            return parseInt(val * current_zoom, 10) / current_zoom;
        };

        // This method sends back an array or a NodeList full of elements that
        // intersect the multi-select rubber-band-box on the current_layer only.
        //
        // We brute-force getIntersectionList for browsers that do not support it (Firefox).
        //
        // Reference:
        // Firefox does not implement getIntersectionList(), see https://bugzilla.mozilla.org/show_bug.cgi?id=501421
        var getIntersectionList = this.getIntersectionList = function (rect) {
            if (rubberBox == null) {
                return null;
            }

            var parent = current_group || getCurrentDrawing().getCurrentLayer();

            var rubberBBox;
            if (!rect) {
                rubberBBox = rubberBox.getBBox();
                var o, bb = svgcontent.createSVGRect();

                for (o in rubberBBox) {
                    bb[o] = rubberBBox[o] / current_zoom;
                }
                rubberBBox = bb;
            } else {
                rubberBBox = svgcontent.createSVGRect();
                rubberBBox.x = rect.x;
                rubberBBox.y = rect.y;
                rubberBBox.width = rect.width;
                rubberBBox.height = rect.height;
            }

            var resultList = null;
            if (!svgedit.browser.isIE) {
                if (typeof (svgroot.getIntersectionList) === 'function') {
                    // Offset the bbox of the rubber box by the offset of the svgcontent element.
                    rubberBBox.x += parseInt(svgcontent.getAttribute('x'), 10);
                    rubberBBox.y += parseInt(svgcontent.getAttribute('y'), 10);

                    resultList = svgroot.getIntersectionList(rubberBBox, parent);
                }
            }

            if (resultList == null || typeof (resultList.item) !== 'function') {
                resultList = [];

                if (!curBBoxes.length) {
                    // Cache all bboxes
                    curBBoxes = getVisibleElementsAndBBoxes();
                }
                var i = curBBoxes.length;
                while (i--) {
                    if (!rubberBBox.width) {
                        continue;
                    }
                    if (svgedit.math.rectsIntersect(rubberBBox, curBBoxes[i].bbox)) {
                        resultList.push(curBBoxes[i].elem);
                    }
                }
            }

            // addToSelection expects an array, but it's ok to pass a NodeList
            // because using square-bracket notation is allowed:
            // http://www.w3.org/TR/DOM-Level-2-Core/ecma-script-binding.html
            return resultList;
        };

        // TODO(codedread): Migrate this into svgutils.js
        // Function: getStrokedBBox
        // Get the bounding box for one or more stroked and/or transformed elements
        //
        // Parameters:
        // elems - Array with DOM elements to check
        //
        // Returns:
        // A single bounding box object
        var getStrokedBBox = this.getStrokedBBox = function (elems) {
            if (!elems) {
                elems = getVisibleElements();
            }
            return svgedit.utilities.getStrokedBBox(elems, addSvgElementFromJson, pathActions);
        };

        // Function: getVisibleElements
        // Get all elements that have a BBox (excludes <defs>, <title>, etc).
        // Note that 0-opacity, off-screen etc elements are still considered "visible"
        // for this function
        //
        // Parameters:
        // parent - The parent DOM element to search within
        //
        // Returns:
        // An array with all "visible" elements.
        var getVisibleElements = this.getVisibleElements = function (parent) {
            if (!parent) {
                parent = $(svgcontent).children(); // Prevent layers from being included
            }

            var contentElems = [];
            $(parent).children().each(function (i, elem) {
                if (elem.getBBox) {
                    contentElems.push(elem);
                }
            });
            return contentElems.reverse();
        };

        // Function: getVisibleElementsAndBBoxes
        // Get all elements that have a BBox (excludes <defs>, <title>, etc).
        // Note that 0-opacity, off-screen etc elements are still considered "visible"
        // for this function
        //
        // Parameters:
        // parent - The parent DOM element to search within
        //
        // Returns:
        // An array with objects that include:
        // * elem - The element
        // * bbox - The element's BBox as retrieved from getStrokedBBox
        var getVisibleElementsAndBBoxes = this.getVisibleElementsAndBBoxes = function (parent) {
            if (!parent) {
                parent = $(svgcontent).children(); // Prevent layers from being included
            }
            var contentElems = [];
            $(parent).children().each(function (i, elem) {
                if (elem.getBBox) {
                    contentElems.push({
                        'elem': elem,
                        'bbox': getStrokedBBox([elem])
                    });
                }
            });
            return contentElems.reverse();
        };

        // Function: groupSvgElem
        // Wrap an SVG element into a group element, mark the group as 'gsvg'
        //
        // Parameters:
        // elem - SVG element to wrap
        var groupSvgElem = this.groupSvgElem = function (elem) {
            var g = document.createElementNS(NS.SVG, 'g');
            elem.parentNode.replaceChild(g, elem);
            $(g).append(elem).data('gsvg', elem)[0].id = getNextId();
        };


        // Set scope for these functions
        var getId, getNextId;
        var textActions, pathActions;

        (function (c) {

            // Object to contain editor event names and callback functions
            var events = {};

            getId = c.getId = function () {
                return getCurrentDrawing().getId();
            };
            getNextId = c.getNextId = function () {
                return getCurrentDrawing().getNextId();
            };

            // Function: call
            // Run the callback function associated with the given event
            //
            // Parameters:
            // event - String with the event name
            // arg - Argument to pass through to the callback function
            call = c.call = function (event, arg) {
                if (events[event]) {
                    return events[event](this, arg);
                }
            };

            // Function: bind
            // Attaches a callback function to an event
            //
            // Parameters:
            // event - String indicating the name of the event
            // f - The callback function to bind to the event
            //
            // Return:
            // The previous event
            c.bind = function (event, f) {
                var old = events[event];
                events[event] = f;
                return old;
            };

        })(canvas);

        // Function: canvas.prepareSvg
        // Runs the SVG Document through the sanitizer and then updates its paths.
        //
        // Parameters:
        // newDoc - The SVG DOM document
        this.prepareSvg = function (newDoc) {
            this.sanitizeSvg(newDoc.documentElement);

            // convert paths into absolute commands
            var i, path, len,
                paths = newDoc.getElementsByTagNameNS(NS.SVG, 'path');
            for (i = 0, len = paths.length; i < len; ++i) {
                path = paths[i];
                path.setAttribute('d', pathActions.convertPath(path));
                pathActions.fixEnd(path);
            }
        };

        // Function: ffClone
        // Hack for Firefox bugs where text element features aren't updated or get
        // messed up. See issue 136 and issue 137.
        // This function clones the element and re-selects it
        // TODO: Test for this bug on load and add it to "support" object instead of
        // browser sniffing
        //
        // Parameters:
        // elem - The (text) DOM element to clone
        var ffClone = function (elem) {
            if (!svgedit.browser.isGecko()) {
                return elem;
            }
            var clone = elem.cloneNode(true);
            elem.parentNode.insertBefore(clone, elem);
            elem.parentNode.removeChild(elem);
            selectorManager.releaseSelector(elem);
            selectedElements[0] = clone;
            selectorManager.requestSelector(clone).showGrips(true);
            return clone;
        };

        this.getObjectLayer = function(elem) {
            while (elem) {
                elem = elem.parentNode;
                if (elem && elem.getAttribute && elem.getAttribute('class') && elem.getAttribute('class').indexOf('layer') >= 0) {
                    var title = $(elem).find('title')[0];
                    if (title) {
                        return { elem: elem, title: title.innerHTML };
                    }
                }
            }
            return null;
        };

        // this.each is deprecated, if any extension used this it can be recreated by doing this:
        // $(canvas.getRootElem()).children().each(...)

        // this.each = function(cb) {
        //	$(svgroot).children().each(cb);
        // };


        // Function: setRotationAngle
        // Removes any old rotations if present, prepends a new rotation at the
        // transformed center
        //
        // Parameters:
        // val - The new rotation angle in degrees
        // preventUndo - Boolean indicating whether the action should be undoable or not
        this.setRotationAngle = function (val, preventUndo, elem) {
            // ensure val is the proper type
            val = parseFloat(val);
            elem = elem || selectedElements[0];
            var oldTransform = elem.getAttribute('transform');
            var bbox = svgedit.utilities.getBBox(elem);
            var cx = bbox.x + bbox.width / 2,
                cy = bbox.y + bbox.height / 2;
            var tlist = svgedit.transformlist.getTransformList(elem);

            // only remove the real rotational transform if present (i.e. at index=0)
            if (tlist.numberOfItems > 0) {
                var xform = tlist.getItem(0);
                if (xform.type == 4) {
                    tlist.removeItem(0);
                }
            }
            // find R_nc and insert it
            if (val != 0) {
                var center = svgedit.math.transformPoint(cx, cy, svgedit.math.transformListToTransform(tlist).matrix);
                var R_nc = svgroot.createSVGTransform();
                R_nc.setRotate(val, center.x, center.y);
                if (tlist.numberOfItems) {
                    tlist.insertItemBefore(R_nc, 0);
                } else {
                    tlist.appendItem(R_nc);
                }
            } else if (tlist.numberOfItems === 0) {
                elem.removeAttribute('transform');
            }

            if (!preventUndo) {
                // we need to undo it, then redo it so it can be undo-able! :)
                // TODO: figure out how to make changes to transform list undo-able cross-browser?
                var newTransform = elem.getAttribute('transform');
                elem.setAttribute('transform', oldTransform);
                changeSelectedAttribute('transform', newTransform, [elem]);
                call('changed', [elem]);
            }
            var pointGripContainer = svgedit.utilities.getElem('pathpointgrip_container');
            //		if (elem.nodeName === 'path' && pointGripContainer) {
            //			pathActions.setPointContainerTransform(elem.getAttribute('transform'));
            //		}
            var selector = selectorManager.requestSelector(selectedElements[0]);
            selector.resize();
            selector.updateGripCursors(val);
        };

        // Function: recalculateAllSelectedDimensions
        // Runs recalculateDimensions on the selected elements,
        // adding the changes to a single batch command
        var recalculateAllSelectedDimensions = this.recalculateAllSelectedDimensions = function () {
            var text = (current_resize_mode === 'none' ? 'position' : 'size');
            var batchCmd = new svgedit.history.BatchCommand(text);

            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                //			if (svgedit.utilities.getRotationAngle(elem) && !svgedit.math.hasMatrixTransform(getTransformList(elem))) {continue;}
                var cmd = svgedit.recalculate.recalculateDimensions(elem);
                if (cmd) {
                    batchCmd.addSubCommand(cmd);
                }
            }

            if (!batchCmd.isEmpty()) {
                addCommandToHistory(batchCmd);
                call('changed', selectedElements);
            }
        };


        // Debug tool to easily see the current matrix in the browser's console
        var logMatrix = function (m) {
            console.log([m.a, m.b, m.c, m.d, m.e, m.f]);
        };

        // Root Current Transformation Matrix in user units
        var root_sctm = null;

        // Group: Selection

        // Function: clearSelection
        // Clears the selection. The 'selected' handler is then called.
        // Parameters:
        // noCall - Optional boolean that when true does not call the "selected" handler
        var clearSelection = this.clearSelection = function (noCall) {
            if (selectedElements[0] != null) {
                var i, elem,
                    len = selectedElements.length;
                for (i = 0; i < len; ++i) {
                    elem = selectedElements[i];
                    if (!elem) {
                        break;
                    }
                    selectorManager.releaseSelector(elem);
                    if (tempGroup) {
                        tempGroup = false;
                        svgCanvas.ungroupTempGroup();
                    }

                    selectedElements[i] = null;
                }
                //		selectedBBoxes[0] = null;
            }
            if (!noCall) {
                call('selected', selectedElements);
            }
        };

        // TODO: do we need to worry about selectedBBoxes here?


        // Function: addToSelection
        // Adds a list of elements to the selection. The 'selected' handler is then called.
        //
        // Parameters:
        // elemsToAdd - an array of DOM elements to add to the selection
        // showGrips - a boolean flag indicating whether the resize grips should be shown
        var addToSelection = this.addToSelection = function (elemsToAdd, showGrips) {
            if (elemsToAdd.length === 0) {
                return;
            }
            // find the first null in our selectedElements array
            var j = 0;

            while (j < selectedElements.length) {
                if (selectedElements[j] == null) {
                    break;
                }
                ++j;
            }

            // now add each element consecutively
            var i = elemsToAdd.length;
            while (i--) {
                var elem = elemsToAdd[i];
                if (!elem) {
                    continue;
                }
                var bbox = svgedit.utilities.getBBox(elem);
                if (!bbox) {
                    continue;
                }

                if (elem.tagName === 'a' && elem.childNodes.length === 1) {
                    // Make "a" element's child be the selected element
                    elem = elem.firstChild;
                }

                // if it's not already there, add it
                if (selectedElements.indexOf(elem) === -1) {

                    selectedElements[j] = elem;

                    // only the first selectedBBoxes element is ever used in the codebase these days
                    //			if (j == 0) selectedBBoxes[0] = svgedit.utilities.getBBox(elem);
                    j++;
                    var sel = selectorManager.requestSelector(elem, bbox);

                    if (selectedElements.length > 1) {
                        sel.showGrips(false);
                    }
                }
            }
            call('selected', selectedElements);

            if (showGrips || selectedElements.length === 1) {
                selectorManager.requestSelector(selectedElements[0]).showGrips(true);
            } else {
                selectorManager.requestSelector(selectedElements[0]).showGrips(false);
            }

            // make sure the elements are in the correct order
            // See: http://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-compareDocumentPosition

            selectedElements.sort(function (a, b) {
                if (a && b && a.compareDocumentPosition) {
                    return 3 - (b.compareDocumentPosition(a) & 6);
                }
                if (a == null) {
                    return 1;
                }
            });

            // Make sure first elements are not null
            while (selectedElements[0] == null) {
                selectedElements.shift(0);
            }
        };

        // Function: selectOnly()
        // Selects only the given elements, shortcut for clearSelection(); addToSelection()
        //
        // Parameters:
        // elems - an array of DOM elements to be selected
        var selectOnly = this.selectOnly = function (elems, showGrips) {
            clearSelection(true);
            addToSelection(elems, showGrips);
        };

        // TODO: could use slice here to make this faster?
        // TODO: should the 'selected' handler

        // Function: removeFromSelection
        // Removes elements from the selection.
        //
        // Parameters:
        // elemsToRemove - an array of elements to remove from selection
        var removeFromSelection = this.removeFromSelection = function (elemsToRemove) {
            if (selectedElements[0] == null) {
                return;
            }
            if (elemsToRemove.length === 0) {
                return;
            }

            // find every element and remove it from our array copy
            var i,
                j = 0,
                newSelectedItems = [],
                len = selectedElements.length;
            newSelectedItems.length = len;
            for (i = 0; i < len; ++i) {
                var elem = selectedElements[i];
                if (elem) {
                    // keep the item
                    if (elemsToRemove.indexOf(elem) === -1) {
                        newSelectedItems[j] = elem;
                        j++;
                    } else { // remove the item and its selector
                        selectorManager.releaseSelector(elem);
                    }
                }
            }
            // the copy becomes the master now
            selectedElements = newSelectedItems;
        };

        // Function: selectAllInCurrentLayer
        // Clears the selection, then adds all elements in the current layer to the selection.
        this.selectAllInCurrentLayer = function () {
            var current_layer = getCurrentDrawing().getCurrentLayer();
            if (current_layer) {
                current_mode = 'select';
                $('.tool-btn').removeClass('active');
                $('#left-Cursor').addClass('active');
                const elemsToAdd = $(current_group || current_layer).children();
                if((elemsToAdd.length === 1) && (elemsToAdd[0].tagName === 'title')){
                    console.warn('Selecting empty layer in "selectAllInCurrentLayer"');
                    return;
                } else {
                    selectOnly(elemsToAdd);
                }
            }
        };

        // Function: getMouseTarget
        // Gets the desired element from a mouse event
        //
        // Parameters:
        // evt - Event object from the mouse event
        //
        // Returns:
        // DOM element we want
        var getMouseTarget = this.getMouseTarget = function (evt) {
            if (evt == null) {
                return null;
            }
            var mouse_target = evt.target;

            // if it was a <use>, Opera and WebKit return the SVGElementInstance
            if (mouse_target.correspondingUseElement) {
                mouse_target = mouse_target.correspondingUseElement;
            }

            // for foreign content, go up until we find the foreignObject
            // WebKit browsers set the mouse target to the svgcanvas div
            if ([NS.MATH, NS.HTML].indexOf(mouse_target.namespaceURI) >= 0 &&
                mouse_target.id !== 'svgcanvas') {
                while (mouse_target.nodeName !== 'foreignObject') {
                    mouse_target = mouse_target.parentNode;
                    if (!mouse_target) {
                        return svgroot;
                    }
                }
            }

            // Get the desired mouse_target with jQuery selector-fu
            // If it's root-like, select the root
            var current_layer = getCurrentDrawing().getCurrentLayer();
            if ([svgroot, container, svgcontent, current_layer].indexOf(mouse_target) >= 0) {
                return svgroot;
            }

            var $target = $(mouse_target);

            // If it's a selection grip, return the grip parent
            if ($target.closest('#selectorParentGroup').length) {
                // While we could instead have just returned mouse_target,
                // this makes it easier to indentify as being a selector grip
                return selectorManager.selectorParentGroup;
            }


            if (!mouse_target) {
                return svgroot;
            }

            // // go up until we hit a child of a layer
            while (mouse_target.parentNode.parentNode.tagName === 'g') {
            	mouse_target = mouse_target.parentNode;
            }
            // Webkit bubbles the mouse event all the way up to the div, so we
            // set the mouse_target to the svgroot like the other browsers
            // if (mouse_target.nodeName.toLowerCase() === 'div') {
            //     mouse_target = svgroot;
            // }

            return mouse_target;
        };

        // Mouse events
        (function () {
            var d_attr = null,
                start_x = null,
                start_y = null,
                r_start_x = null,
                r_start_y = null,
                init_bbox = {},
                freehand = {
                    minx: null,
                    miny: null,
                    maxx: null,
                    maxy: null
                },
                sumDistance = 0,
                controllPoint2 = {
                    x: 0,
                    y: 0
                },
                controllPoint1 = {
                    x: 0,
                    y: 0
                },
                start = {
                    x: 0,
                    y: 0
                },
                end = {
                    x: 0,
                    y: 0
                },
                parameter,
                nextParameter,
                bSpline = {
                    x: 0,
                    y: 0
                },
                nextPos = {
                    x: 0,
                    y: 0
                },
                THRESHOLD_DIST = 0.8,
                STEP_COUNT = 10;

            var getBsplinePoint = function (t) {
                var spline = {
                        x: 0,
                        y: 0
                    },
                    p0 = controllPoint2,
                    p1 = controllPoint1,
                    p2 = start,
                    p3 = end,
                    S = 1.0 / 6.0,
                    t2 = t * t,
                    t3 = t2 * t;

                var m = [
                    [-1, 3, -3, 1],
                    [3, -6, 3, 0],
                    [-3, 0, 3, 0],
                    [1, 4, 1, 0]
                ];

                spline.x = S * (
                    (p0.x * m[0][0] + p1.x * m[0][1] + p2.x * m[0][2] + p3.x * m[0][3]) * t3 +
                    (p0.x * m[1][0] + p1.x * m[1][1] + p2.x * m[1][2] + p3.x * m[1][3]) * t2 +
                    (p0.x * m[2][0] + p1.x * m[2][1] + p2.x * m[2][2] + p3.x * m[2][3]) * t +
                    (p0.x * m[3][0] + p1.x * m[3][1] + p2.x * m[3][2] + p3.x * m[3][3])
                );
                spline.y = S * (
                    (p0.y * m[0][0] + p1.y * m[0][1] + p2.y * m[0][2] + p3.y * m[0][3]) * t3 +
                    (p0.y * m[1][0] + p1.y * m[1][1] + p2.y * m[1][2] + p3.y * m[1][3]) * t2 +
                    (p0.y * m[2][0] + p1.y * m[2][1] + p2.y * m[2][2] + p3.y * m[2][3]) * t +
                    (p0.y * m[3][0] + p1.y * m[3][1] + p2.y * m[3][2] + p3.y * m[3][3])
                );

                return {
                    x: spline.x,
                    y: spline.y
                };
            };
            // - when we are in a create mode, the element is added to the canvas
            // but the action is not recorded until mousing up
            // - when we are in select mode, select the element, remember the position
            // and do nothing else
            var mouseDown = function (evt) {
                if (canvas.spaceKey || evt.button === 1) {
                    return;
                }

                var right_click = evt.button === 2;

                if (evt.altKey) { // duplicate when dragging
                    svgCanvas.cloneSelectedElements(0, 0);
                }

                root_sctm = $('#svgcontent')[0].getScreenCTM().inverse();

                var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm),
                    mouse_x = pt.x * current_zoom,
                    mouse_y = pt.y * current_zoom;
                var ext_result = null;

                evt.preventDefault();

                if (right_click) {
                    current_mode = 'select';
                    $('.tool-btn').removeClass('active');
                    $('#left-Cursor').addClass('active');
                    lastClickPoint = pt;
                }

                // This would seem to be unnecessary...
                //		if (['select', 'resize'].indexOf(current_mode) == -1) {
                //			setGradient();
                //		}
                var x = mouse_x / current_zoom,
                    y = mouse_y / current_zoom,
                    mouse_target = getMouseTarget(evt);

                if (mouse_target.tagName === 'a' && mouse_target.childNodes.length === 1) {
                    mouse_target = mouse_target.firstChild;
                }

                // real_x/y ignores grid-snap value
                var real_x = x;
                r_start_x = start_x = x;
                var real_y = y;
                r_start_y = start_y = y;

                if (curConfig.gridSnapping) {
                    x = svgedit.utilities.snapToGrid(x);
                    y = svgedit.utilities.snapToGrid(y);
                    start_x = svgedit.utilities.snapToGrid(start_x);
                    start_y = svgedit.utilities.snapToGrid(start_y);
                }

                // if it is a selector grip, then it must be a single element selected,
                // set the mouse_target to that and update the mode to rotate/resize

                if (mouse_target === selectorManager.selectorParentGroup && selectedElements[0] != null) {
                    var grip = evt.target;
                    var griptype = elData(grip, 'type');
                    // rotating
                    if (griptype === 'rotate') {
                        current_mode = 'rotate';
                    }
                    // resizing
                    else if (griptype === 'resize') {
                        current_mode = 'resize';
                        current_resize_mode = elData(grip, 'dir');
                    }
                    mouse_target = selectedElements[0];
                }

                if (ext_result = runExtensions('checkMouseTarget', { mouseTarget: mouse_target }, true)) {
                    let extensionEvent = false;
                    $.each(ext_result, function (i, r) {
                        started = started || (r && r.started);
                    });
                    if (started && current_mode !== 'path') {
                        return;
                    }
                }

                startTransform = mouse_target.getAttribute('transform');
                var i, stroke_w,
                    tlist = svgedit.transformlist.getTransformList(mouse_target);

                switch (current_mode) {
                    case 'select':
                        started = true;
                        current_resize_mode = 'none';
                        if (right_click) {
                            started = false;
                        }
                        if ($('#selectorGroup0').css('display') === 'inline') {
                            justClearSelection = true;
                        }
                        //console.log(svgCanvas.getObjectLayer(mouse_target).elem);
                        if (mouse_target !== svgroot && !svgCanvas.getObjectLayer(mouse_target).elem.getAttribute('data-lock')) {
                            // if this element is not yet selected, clear selection and select it
                            if (selectedElements.indexOf(mouse_target) === -1) {
                                // only clear selection if shift is not pressed (otherwise, add
                                // element to selection)
                                if (!evt.shiftKey) {
                                    // No need to do the call here as it will be done on addToSelection
                                    clearSelection(true);
                                }
                                addToSelection([mouse_target]);
                                justSelected = mouse_target;
                                pathActions.clear();
                            }
                            // else if it's a path, go into pathedit mode in mouseup

                            if (!right_click) {
                                // insert a dummy transform so if the element(s) are moved it will have
                                // a transform to use for its translate
                                for (i = 0; i < selectedElements.length; ++i) {
                                    if (selectedElements[i] == null) {
                                        continue;
                                    }
                                    var slist = svgedit.transformlist.getTransformList(selectedElements[i]);
                                    if (slist.numberOfItems) {
                                        slist.insertItemBefore(svgroot.createSVGTransform(), 0);
                                    } else {
                                        slist.appendItem(svgroot.createSVGTransform());
                                    }
                                }
                            }
                        } else if (!right_click) {
                            clearSelection();
                            if (PreviewModeController.isPreviewMode()) {
                                current_mode = 'preview';
                            } else {
                                current_mode = 'multiselect';
                            }

                            if (rubberBox == null) {
                                rubberBox = selectorManager.getRubberBandBox();
                            }
                            r_start_x *= current_zoom;
                            r_start_y *= current_zoom;
                            //					console.log('p',[evt.pageX, evt.pageY]);
                            //					console.log('c',[evt.clientX, evt.clientY]);
                            //					console.log('o',[evt.offsetX, evt.offsetY]);
                            //					console.log('s',[start_x, start_y]);

                            svgedit.utilities.assignAttributes(rubberBox, {
                                'x': r_start_x,
                                'y': r_start_y,
                                'width': 0,
                                'height': 0,
                                'display': 'inline'
                            }, 100);
                        }
                        break;
                    case 'zoom':
                        started = true;
                        if (rubberBox == null) {
                            rubberBox = selectorManager.getRubberBandBox();
                        }
                        svgedit.utilities.assignAttributes(rubberBox, {
                            'x': real_x * current_zoom,
                            'y': real_x * current_zoom,
                            'width': 0,
                            'height': 0,
                            'display': 'inline'
                        }, 100);
                        break;
                    case 'resize':
                        started = true;
                        start_x = x;
                        start_y = y;

                        // Getting the BBox from the selection box, since we know we
                        // want to orient around it
                        init_bbox = svgedit.utilities.getBBox($('#selectedBox0')[0]);
                        var bb = {};
                        $.each(init_bbox, function (key, val) {
                            bb[key] = val / current_zoom;
                        });
                        init_bbox = (mouse_target.tagName === 'use') ? svgCanvas.getSvgRealLocation(mouse_target) : bb;

                        // append three dummy transforms to the tlist so that
                        // we can translate,scale,translate in mousemove
                        var pos = svgedit.utilities.getRotationAngle(mouse_target) ? 1 : 0;

                        if (svgedit.math.hasMatrixTransform(tlist)) {
                            tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
                            tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
                            tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
                        } else {
                            tlist.appendItem(svgroot.createSVGTransform());
                            tlist.appendItem(svgroot.createSVGTransform());
                            tlist.appendItem(svgroot.createSVGTransform());

                            if (svgedit.browser.supportsNonScalingStroke()) {
                                // Handle crash for newer Chrome and Safari 6 (Mobile and Desktop):
                                // https://code.google.com/p/svg-edit/issues/detail?id=904
                                // Chromium issue: https://code.google.com/p/chromium/issues/detail?id=114625
                                // TODO: Remove this workaround once vendor fixes the issue
                                var isWebkit = svgedit.browser.isWebkit();

                                if (isWebkit) {
                                    var delayedStroke = function (ele) {
                                        var _stroke = ele.getAttributeNS(null, 'stroke');
                                        ele.removeAttributeNS(null, 'stroke');
                                        // Re-apply stroke after delay. Anything higher than 1 seems to cause flicker
                                        if (_stroke !== null) {setTimeout(function () {
                                            ele.setAttributeNS(null, 'stroke', _stroke);
                                        }, 0);}
                                    };
                                }
                                mouse_target.style.vectorEffect = 'non-scaling-stroke';
                                if (isWebkit) {
                                    delayedStroke(mouse_target);
                                }

                                var all = mouse_target.getElementsByTagName('*'),
                                    len = all.length;
                                for (i = 0; i < len; i++) {
                                    all[i].style.vectorEffect = 'non-scaling-stroke';
                                    if (isWebkit) {
                                        delayedStroke(all[i]);
                                    }
                                }
                            }
                        }
                        break;
                    case 'fhellipse':
                    case 'fhrect':
                    case 'fhpath':
                        start.x = real_x;
                        start.y = real_y;
                        started = true;
                        d_attr = real_x + ',' + real_y + ' ';
                        stroke_w = cur_shape.stroke_width == 0 ? 1 : cur_shape.stroke_width;
                        addSvgElementFromJson({
                            element: 'polyline',
                            curStyles: true,
                            attr: {
                                points: d_attr,
                                id: getNextId(),
                                fill: 'none',
                                opacity: cur_shape.opacity / 2,
                                'stroke-linecap': 'round',
                                style: 'pointer-events:none'
                            }
                        });
                        freehand.minx = real_x;
                        freehand.maxx = real_x;
                        freehand.miny = real_y;
                        freehand.maxy = real_y;
                        break;
                    case 'image':
                        started = true;
                        var newImage = addSvgElementFromJson({
                            element: 'image',
                            attr: {
                                x: x,
                                y: y,
                                width: 0,
                                height: 0,
                                id: getNextId(),
                                opacity: cur_shape.opacity / 2,
                                style: 'pointer-events:inherit'
                            }
                        });
                        setHref(newImage, last_good_img_url);
                        svgedit.utilities.preventClickDefault(newImage);
                        break;
                    case 'square':
                        // FIXME: once we create the rect, we lose information that this was a square
                        // (for resizing purposes this could be important)
                    case 'rect':
                        started = true;
                        start_x = x;
                        start_y = y;
                        const newRect = addSvgElementFromJson({
                            element: 'rect',
                            curStyles: false,
                            attr: {
                                x: x,
                                y: y,
                                width: 0,
                                height: 0,
                                stroke: '#000',
                                id: getNextId(),
                                'fill-opacity': 0,
                                opacity: cur_shape.opacity / 2
                            }
                        });
                        if (canvas.isUseLayerColor) {
                            canvas.updateElementColor(newRect);
                        }
                        selectOnly([newRect], true);
                        break;
                    case 'line':
                        started = true;
                        const newLine = addSvgElementFromJson({
                            element: 'line',
                            curStyles: false,
                            attr: {
                                x1: x,
                                y1: y,
                                x2: x,
                                y2: y,
                                id: getNextId(),
                                stroke: '#000',
                                'stroke-width': 1,
                                'stroke-dasharray': cur_shape.stroke_dasharray,
                                'stroke-linejoin': cur_shape.stroke_linejoin,
                                'stroke-linecap': cur_shape.stroke_linecap,
                                'stroke-opacity': cur_shape.stroke_opacity,
                                fill: 'none',
                                opacity: cur_shape.opacity / 2,
                                style: 'pointer-events:none'
                            }
                        });
                        if (canvas.isUseLayerColor) {
                            canvas.updateElementColor(newLine);
                        }
                        selectOnly([newLine], true);
                        break;
                    case 'circle':
                        started = true;
                        addSvgElementFromJson({
                            element: 'circle',
                            curStyles: false,
                            attr: {
                                cx: x,
                                cy: y,
                                r: 0,
                                id: getNextId(),
                                stroke: '#000',
                                opacity: cur_shape.opacity / 2
                            }
                        });
                        break;
                    case 'ellipse':
                        started = true;
                        const newElli = addSvgElementFromJson({
                            element: 'ellipse',
                            curStyles: false,
                            attr: {
                                cx: x,
                                cy: y,
                                rx: 0,
                                ry: 0,
                                id: getNextId(),
                                stroke: '#000',
                                'fill-opacity': 0,
                                opacity: cur_shape.opacity / 2
                            }
                        });
                        if (canvas.isUseLayerColor) {
                            canvas.updateElementColor(newElli);
                        }
                        selectOnly([newElli], true);
                        break;
                    case 'text':
                        started = true;
                        var newText = addSvgElementFromJson({
                            element: 'text',
                            curStyles: true,
                            attr: {
                                x: x,
                                y: y,
                                id: getNextId(),
                                fill: cur_text.fill,
                                'fill-opacity': cur_text.fill_opacity,
                                'stroke-width': 2,
                                'font-size': cur_text.font_size,
                                'font-family': cur_text.font_family,
                                'text-anchor': cur_text.text_anchor,
                                'xml:space': 'preserve',
                                opacity: cur_shape.opacity
                            }
                        });
                        //					newText.textContent = 'text';
                        if (canvas.isUseLayerColor) {
                            canvas.updateElementColor(newText);
                        }
                        break;
                    case 'path':
                        // Fall through
                    case 'pathedit':
                        start_x *= current_zoom;
                        start_y *= current_zoom;
                        if (canvas.isBezierPathAlignToEdge) {
                            let {xMatchPoint, yMatchPoint} = canvas.findMatchPoint(mouse_x, mouse_y);
                            start_x = xMatchPoint ? xMatchPoint.x * current_zoom : start_x;
                            start_y = yMatchPoint ? yMatchPoint.y * current_zoom : start_y;
                        }
                        pathActions.mouseDown(evt, mouse_target, start_x, start_y);
                        started = true;
                        break;
                    case 'textedit':
                        start_x *= current_zoom;
                        start_y *= current_zoom;
                        textActions.mouseDown(evt, mouse_target, start_x, start_y);
                        started = true;
                        break;
                    case 'rotate':
                        started = true;
                        // we are starting an undoable change (a drag-rotation)
                        canvas.undoMgr.beginUndoableChange('transform', selectedElements);
                        break;
                    default:
                        // This could occur in an extension
                        break;
                }

                ext_result = runExtensions('mouseDown', {
                    event: evt,
                    start_x: start_x,
                    start_y: start_y,
                    selectedElements: selectedElements
                }, true);

                $.each(ext_result, function (i, r) {
                    if (r && r.started) {
                        started = true;
                    }
                });
            };

            // in this function we do not record any state changes yet (but we do update
            // any elements that are still being created, moved or resized on the canvas)
            var mouseMove = function (evt) {
                if (evt.button === 1 || canvas.spaceKey) {
                    return;
                }

                root_sctm = $('#svgcontent')[0].getScreenCTM().inverse();
                var i, xya, c, cx, cy, dx, dy, len, angle, box,
                    selected = selectedElements[0],
                    pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm),
                    mouse_x = pt.x * current_zoom,
                    mouse_y = pt.y * current_zoom,
                    shape = svgedit.utilities.getElem(getId());

                var real_x = mouse_x / current_zoom;
                x = real_x;
                var real_y = mouse_y / current_zoom;
                y = real_y;

                if (!started) {
                    if (canvas.isBezierPathAlignToEdge) {
                        if (current_mode === 'path') {
                            let {xMatchPoint, yMatchPoint} = canvas.findMatchPoint(mouse_x, mouse_y);
                            let x = xMatchPoint ? xMatchPoint.x * current_zoom : mouse_x;
                            let y = yMatchPoint ? yMatchPoint.y * current_zoom : mouse_y;
                            canvas.drawAlignLine(x, y, xMatchPoint, yMatchPoint);
                        }
                    }
                    return;
                }

                if (curConfig.gridSnapping) {
                    x = svgedit.utilities.snapToGrid(x);
                    y = svgedit.utilities.snapToGrid(y);
                }

                evt.preventDefault();
                var tlist;
                switch (current_mode) {
                    case 'select':
                        // we temporarily use a translate on the element(s) being dragged
                        // this transform is removed upon mousing up and the element is
                        // relocated to the new location
                        if (selectedElements[0] !== null) {
                            dx = x - start_x;
                            dy = y - start_y;

                            if (curConfig.gridSnapping) {
                                dx = svgedit.utilities.snapToGrid(dx);
                                dy = svgedit.utilities.snapToGrid(dy);
                            }

                            if (evt.shiftKey) {
                                xya = svgedit.math.snapToAngle(start_x, start_y, x, y);
                                dx = xya.x - start_x;
                                dy = xya.y - start_y;
                            }

                            if (dx !== 0 || dy !== 0) {
                                len = selectedElements.length;
                                for (i = 0; i < len; ++i) {
                                    selected = selectedElements[i];
                                    if (selected == null) {
                                        break;
                                    }
                                    //							if (i==0) {
                                    //								var box = svgedit.utilities.getBBox(selected);
                                    //									selectedBBoxes[i].x = box.x + dx;
                                    //									selectedBBoxes[i].y = box.y + dy;
                                    //							}

                                    // update the dummy transform in our transform list
                                    // to be a translate
                                    var xform = svgroot.createSVGTransform();
                                    tlist = svgedit.transformlist.getTransformList(selected);
                                    // Note that if Webkit and there's no ID for this
                                    // element, the dummy transform may have gotten lost.
                                    // This results in unexpected behaviour

                                    xform.setTranslate(dx, dy);
                                    if (tlist.numberOfItems) {
                                        tlist.replaceItem(xform, 0);
                                    } else {
                                        tlist.appendItem(xform);
                                    }

                                    // update our internal bbox that we're tracking while dragging
                                    selectorManager.requestSelector(selected).resize();
                                }

                                call('transition', selectedElements);
                                ObjectPanelsController.setEditable(false);
                            }
                        }
                        break;
                    case 'preview':
                        real_x *= current_zoom;
                        real_y *= current_zoom;
                        svgedit.utilities.assignAttributes(rubberBox, {
                            'x': Math.min(r_start_x, real_x),
                            'y': Math.min(r_start_y, real_y),
                            'width': Math.abs(real_x - r_start_x),
                            'height': Math.abs(real_y - r_start_y)
                        }, 100);
                        break;
                    case 'multiselect':
                        real_x *= current_zoom;
                        real_y *= current_zoom;
                        svgedit.utilities.assignAttributes(rubberBox, {
                            'x': Math.min(r_start_x, real_x),
                            'y': Math.min(r_start_y, real_y),
                            'width': Math.abs(real_x - r_start_x),
                            'height': Math.abs(real_y - r_start_y)
                        }, 100);

                        // for each selected:
                        // - if newList contains selected, do nothing
                        // - if newList doesn't contain selected, remove it from selected
                        // - for any newList that was not in selectedElements, add it to selected
                        var elemsToRemove = selectedElements.slice(),
                            elemsToAdd = [],
                            newList = getIntersectionList();

                        // For every element in the intersection, add if not present in selectedElements.
                        len = newList.length;
                        for (i = 0; i < len; ++i) {
                            var intElem = newList[i];
                            // Found an element that was not selected before, so we should add it.
                            if (selectedElements.indexOf(intElem) === -1) {
                                const layer = svgCanvas.getObjectLayer(intElem).elem;
                                if (layer.getAttribute('data-lock') || layer.getAttribute('display') === 'none') {
                                    continue;
                                }
                                elemsToAdd.push(intElem);
                            }
                            // Found an element that was already selected, so we shouldn't remove it.
                            var foundInd = elemsToRemove.indexOf(intElem);
                            if (foundInd !== -1) {
                                elemsToRemove.splice(foundInd, 1);
                            }
                        }

                        if (elemsToRemove.length > 0) {
                            canvas.removeFromSelection(elemsToRemove);
                        }

                        if (elemsToAdd.length > 0) {
                            canvas.addToSelection(elemsToAdd);
                        }

                        break;
                    case 'resize':
                        // we track the resize bounding box and translate/scale the selected element
                        // while the mouse is down, when mouse goes up, we use this to recalculate
                        // the shape's coordinates
                        tlist = svgedit.transformlist.getTransformList(selected);
                        var hasMatrix = svgedit.math.hasMatrixTransform(tlist);
                        box = hasMatrix ? init_bbox : svgedit.utilities.getBBox(selected);
                        var left = box.x,
                            top = box.y,
                            width = box.width,
                            height = box.height;
                        dx = (x - start_x);
                        dy = (y - start_y);

                        if (curConfig.gridSnapping) {
                            dx = svgedit.utilities.snapToGrid(dx);
                            dy = svgedit.utilities.snapToGrid(dy);
                            height = svgedit.utilities.snapToGrid(height);
                            width = svgedit.utilities.snapToGrid(width);
                        }

                        // if rotated, adjust the dx,dy values
                        angle = svgedit.utilities.getRotationAngle(selected);
                        if (angle) {
                            var r = Math.sqrt(dx * dx + dy * dy),
                                theta = Math.atan2(dy, dx) - angle * Math.PI / 180.0;
                            dx = r * Math.cos(theta);
                            dy = r * Math.sin(theta);
                        }

                        // if not stretching in y direction, set dy to 0
                        // if not stretching in x direction, set dx to 0
                        if (current_resize_mode.indexOf('n') === -1 && current_resize_mode.indexOf('s') === -1) {
                            dy = 0;
                        }
                        if (current_resize_mode.indexOf('e') === -1 && current_resize_mode.indexOf('w') === -1) {
                            dx = 0;
                        }

                        var ts = null,
                            tx = 0,
                            ty = 0,
                            sy = height ? (height + dy) / height : 1,
                            sx = width ? (width + dx) / width : 1;
                        // if we are dragging on the north side, then adjust the scale factor and ty
                        if (current_resize_mode.indexOf('n') >= 0) {
                            sy = height ? (height - dy) / height : 1;
                            ty = height;
                        }

                        // if we dragging on the east side, then adjust the scale factor and tx
                        if (current_resize_mode.indexOf('w') >= 0) {
                            sx = width ? (width - dx) / width : 1;
                            tx = width;
                        }

                        // update the transform list with translate,scale,translate
                        var translateOrigin = svgroot.createSVGTransform(),
                            scale = svgroot.createSVGTransform(),
                            translateBack = svgroot.createSVGTransform();

                        if (curConfig.gridSnapping) {
                            left = svgedit.utilities.snapToGrid(left);
                            tx = svgedit.utilities.snapToGrid(tx);
                            top = svgedit.utilities.snapToGrid(top);
                            ty = svgedit.utilities.snapToGrid(ty);
                        }

                        translateOrigin.setTranslate(-(left + tx), -(top + ty));
                        if (ObjectPanelsController.isResizeFixed() || evt.shiftKey) {
                            if (sx === 1) {
                                sx = sy;
                            } else {
                                sy = sx;
                            }
                        }
                        scale.setScale(sx, sy);
                        translateBack.setTranslate(left + tx, top + ty);
                        if (hasMatrix) {
                            var diff = angle ? 1 : 0;
                            tlist.replaceItem(translateOrigin, 2 + diff);
                            tlist.replaceItem(scale, 1 + diff);
                            tlist.replaceItem(translateBack, Number(diff));
                        } else {
                            var N = tlist.numberOfItems;
                            tlist.replaceItem(translateBack, N - 3);
                            tlist.replaceItem(scale, N - 2);
                            tlist.replaceItem(translateOrigin, N - 1);
                        }

                        //Bounding box calculation
                        //const oldCx = left + width / 2;
                        //const oldCy = top + height / 2;
                        switch (selected.tagName) {
                            case 'rect':
                            case 'path':
                            case 'use':
                            case 'polygon':
                            case 'image':
                            case 'ellipse':
                                const dCx = tx === 0 ? 0.5 * width * (sx - 1) : 0.5 * width * (1 - sx);
                                const dCy = ty === 0 ? 0.5 * height * (sy - 1): 0.5 * height * (1 - sy);
                                theta = angle * Math.PI / 180;
                                const newCx = left + width / 2 + dCx * Math.cos(theta) - dCy * Math.sin(theta);
                                const newCy = top + height / 2 + dCx * Math.sin(theta) + dCy * Math.cos(theta);
                                const newWidth = Math.abs(width * sx);
                                const newHeight = Math.abs(height * sy);
                                const newLeft = newCx - 0.5 * newWidth;
                                const newTop = newCy - 0.5 * newHeight;
                                
                                if (selected.tagName === 'ellipse') {
                                    ObjectPanelsController.setEllipsePositionX(newCx);
                                    ObjectPanelsController.setEllipsePositionY(newCy);
                                    ObjectPanelsController.setEllipseRadiusX(newWidth / 2);
                                    ObjectPanelsController.setEllipseRadiusY(newHeight / 2);
                                } else {
                                    ObjectPanelsController.setPosition(newLeft, newTop);
                                    ObjectPanelsController.setWidth(newWidth);
                                    ObjectPanelsController.setHeight(newHeight);
                                }
                                break;
                        }
                        
                        selectorManager.requestSelector(selected).resize();
                        call('transition', selectedElements);
                        ObjectPanelsController.setEditable(false);
                        if (svgedit.utilities.getElem('text_cursor')) {
                            svgCanvas.textActions.init();
                        }
                        break;
                    case 'zoom':
                        real_x *= current_zoom;
                        real_y *= current_zoom;
                        svgedit.utilities.assignAttributes(rubberBox, {
                            'x': Math.min(r_start_x * current_zoom, real_x),
                            'y': Math.min(r_start_y * current_zoom, real_y),
                            'width': Math.abs(real_x - r_start_x * current_zoom),
                            'height': Math.abs(real_y - r_start_y * current_zoom)
                        }, 100);
                        break;
                    case 'text':
                        svgedit.utilities.assignAttributes(shape, {
                            'x': x,
                            'y': y
                        }, 1000);
                        break;
                    case 'line':
                        if (curConfig.gridSnapping) {
                            x = svgedit.utilities.snapToGrid(x);
                            y = svgedit.utilities.snapToGrid(y);
                        }

                        var x2 = x;
                        var y2 = y;

                        if (evt.shiftKey) {
                            xya = svgedit.math.snapToAngle(start_x, start_y, x2, y2);
                            x2 = xya.x;
                            y2 = xya.y;
                        }
                        selectorManager.requestSelector(selected).resize();
                        shape.setAttributeNS(null, 'x2', x2);
                        shape.setAttributeNS(null, 'y2', y2);
                        ObjectPanelsController.setLineX2(x2);
                        ObjectPanelsController.setLineY2(y2);
                        break;
                    case 'foreignObject':
                        // fall through
                    case 'square':
                        // fall through
                    case 'rect':
                        // fall through
                    case 'image':
                        var square = (current_mode === 'square') || evt.shiftKey,
                            w = Math.abs(x - start_x),
                            h = Math.abs(y - start_y),
                            new_x, new_y;
                        if (square) {
                            w = h = Math.max(w, h);
                            new_x = start_x < x ? start_x : start_x - w;
                            new_y = start_y < y ? start_y : start_y - h;
                        } else {
                            new_x = Math.min(start_x, x);
                            new_y = Math.min(start_y, y);
                        }

                        if (curConfig.gridSnapping) {
                            w = svgedit.utilities.snapToGrid(w);
                            h = svgedit.utilities.snapToGrid(h);
                            new_x = svgedit.utilities.snapToGrid(new_x);
                            new_y = svgedit.utilities.snapToGrid(new_y);
                        }

                        svgedit.utilities.assignAttributes(shape, {
                            'width': w,
                            'height': h,
                            'x': new_x,
                            'y': new_y
                        }, 1000);
                        ObjectPanelsController.setPosition(new_x, new_y);
                        ObjectPanelsController.setWidth(w);
                        ObjectPanelsController.setHeight(h);
                        selectorManager.requestSelector(selected).resize();
                        break;
                    case 'circle':
                        c = $(shape).attr(['cx', 'cy']);
                        cx = c.cx;
                        cy = c.cy;
                        var rad = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                        if (curConfig.gridSnapping) {
                            rad = svgedit.utilities.snapToGrid(rad);
                        }
                        shape.setAttributeNS(null, 'r', rad);
                        break;
                    case 'ellipse':
                        c = $(shape).attr(['cx', 'cy']);
                        cx = c.cx;
                        cy = c.cy;

                        shape.setAttributeNS(null, 'rx', Math.abs(x - cx));
                        var ry = Math.abs(evt.shiftKey ? (x - cx) : (y - cy));
                        shape.setAttributeNS(null, 'ry', ry);

                        ObjectPanelsController.setEllipseRadiusX(Math.abs(x - cx));
                        ObjectPanelsController.setEllipseRadiusY(ry);
                        selectorManager.requestSelector(selected).resize();
                        break;
                    case 'fhellipse':
                    case 'fhrect':
                        freehand.minx = Math.min(real_x, freehand.minx);
                        freehand.maxx = Math.max(real_x, freehand.maxx);
                        freehand.miny = Math.min(real_y, freehand.miny);
                        freehand.maxy = Math.max(real_y, freehand.maxy);
                        // break; missing on purpose
                    case 'fhpath':
                        //				d_attr += + real_x + ',' + real_y + ' ';
                        //				shape.setAttributeNS(null, 'points', d_attr);
                        end.x = real_x;
                        end.y = real_y;
                        if (controllPoint2.x && controllPoint2.y) {
                            for (i = 0; i < STEP_COUNT - 1; i++) {
                                parameter = i / STEP_COUNT;
                                nextParameter = (i + 1) / STEP_COUNT;
                                bSpline = getBsplinePoint(nextParameter);
                                nextPos = bSpline;
                                bSpline = getBsplinePoint(parameter);
                                sumDistance += Math.sqrt((nextPos.x - bSpline.x) * (nextPos.x - bSpline.x) + (nextPos.y - bSpline.y) * (nextPos.y - bSpline.y));
                                if (sumDistance > THRESHOLD_DIST) {
                                    d_attr += +bSpline.x + ',' + bSpline.y + ' ';
                                    shape.setAttributeNS(null, 'points', d_attr);
                                    sumDistance -= THRESHOLD_DIST;
                                }
                            }
                        }
                        controllPoint2 = {
                            x: controllPoint1.x,
                            y: controllPoint1.y
                        };
                        controllPoint1 = {
                            x: start.x,
                            y: start.y
                        };
                        start = {
                            x: end.x,
                            y: end.y
                        };
                        break;
                        // update path stretch line coordinates
                    case 'path':
                        // fall through
                    case 'pathedit':
                        x *= current_zoom;
                        y *= current_zoom;

                        if (curConfig.gridSnapping) {
                            x = svgedit.utilities.snapToGrid(x);
                            y = svgedit.utilities.snapToGrid(y);
                            start_x = svgedit.utilities.snapToGrid(start_x);
                            start_y = svgedit.utilities.snapToGrid(start_y);
                        }
                        if (evt.shiftKey) {
                            var path = svgedit.path.path;
                            var x1, y1;
                            if (path) {
                                x1 = path.dragging ? path.dragging[0] : start_x;
                                y1 = path.dragging ? path.dragging[1] : start_y;
                            } else {
                                x1 = start_x;
                                y1 = start_y;
                            }
                            xya = svgedit.math.snapToAngle(x1, y1, x, y);
                            x = xya.x;
                            y = xya.y;
                        }

                        if (rubberBox && rubberBox.getAttribute('display') !== 'none') {
                            real_x *= current_zoom;
                            real_y *= current_zoom;
                            svgedit.utilities.assignAttributes(rubberBox, {
                                'x': Math.min(r_start_x * current_zoom, real_x),
                                'y': Math.min(r_start_y * current_zoom, real_y),
                                'width': Math.abs(real_x - r_start_x * current_zoom),
                                'height': Math.abs(real_y - r_start_y * current_zoom)
                            }, 100);
                        }
                        if (canvas.isBezierPathAlignToEdge) {
                            let {xMatchPoint, yMatchPoint} = canvas.findMatchPoint(mouse_x, mouse_y);
                            x = xMatchPoint ? xMatchPoint.x * current_zoom : x;
                            y = yMatchPoint ? yMatchPoint.y * current_zoom : y;
                            canvas.drawAlignLine(x, y, xMatchPoint, yMatchPoint);
                        }
                        pathActions.mouseMove(x, y);

                        break;
                    case 'textedit':
                        x *= current_zoom;
                        y *= current_zoom;
                        //					if (rubberBox && rubberBox.getAttribute('display') !== 'none') {
                        //						svgedit.utilities.assignAttributes(rubberBox, {
                        //							'x': Math.min(start_x,x),
                        //							'y': Math.min(start_y,y),
                        //							'width': Math.abs(x-start_x),
                        //							'height': Math.abs(y-start_y)
                        //						},100);
                        //					}

                        textActions.mouseMove(mouse_x, mouse_y);

                        break;
                    case 'rotate':
                        box = svgedit.utilities.getBBox(selected);
                        cx = box.x + box.width / 2;
                        cy = box.y + box.height / 2;
                        var m = svgedit.math.getMatrix(selected),
                            center = svgedit.math.transformPoint(cx, cy, m);
                        cx = center.x;
                        cy = center.y;
                        angle = ((Math.atan2(cy - y, cx - x) * (180 / Math.PI)) - 90) % 360;
                        if (curConfig.gridSnapping) {
                            angle = svgedit.utilities.snapToGrid(angle);
                        }
                        if (evt.shiftKey) { // restrict rotations to nice angles (WRS)
                            var snap = 45;
                            angle = Math.round(angle / snap) * snap;
                        }

                        canvas.setRotationAngle(angle < -180 ? (360 + angle) : angle, true);
                        call('transition', selectedElements);
                        ObjectPanelsController.setRotation(angle < -180 ? (360 + angle) : angle);
                        ObjectPanelsController.setEditable(false);
                        break;
                    default:
                        break;
                }

                runExtensions('mouseMove', {
                    event: evt,
                    mouse_x: mouse_x,
                    mouse_y: mouse_y,
                    selected: selected,
                    ObjectPanelsController: ObjectPanelsController
                });

            }; // mouseMove()

            // - in create mode, the element's opacity is set properly, we create an InsertElementCommand
            // and store it on the Undo stack
            // - in move/resize mode, the element's attributes which were affected by the move/resize are
            // identified, a ChangeElementCommand is created and stored on the stack for those attrs
            // this is done in when we recalculate the selected dimensions()
            var mouseUp = function (evt) {
                ObjectPanelsController.setEditable(true);
                if (evt.button === 2) {
                    return;
                }
                var tempJustSelected = justSelected;
                justSelected = null;
                if (!started) {
                    return;
                }
                var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm),
                    mouse_x = pt.x * current_zoom,
                    mouse_y = pt.y * current_zoom,
                    x = mouse_x / current_zoom,
                    y = mouse_y / current_zoom,
                    element = svgedit.utilities.getElem(getId()),
                    keep = false;

                var real_x = x;
                var real_y = y;

                // TODO: Make true when in multi-unit mode
                var useUnit = false; // (curConfig.baseUnit !== 'px');
                started = false;
                var attrs, t;

                selectedElems = selectedElements.filter((e) => e !== null);


                switch (current_mode) {
                    case 'preview':
                        if (rubberBox != null) {
                            rubberBox.setAttribute('display', 'none');
                            curBBoxes = [];
                        };
                        if (justClearSelection) {
                            justClearSelection = false;
                        } 
                        BeamboxActions.startDrawingPreviewBlob();

                        if (start_x === real_x && start_y === real_y) {
                            PreviewModeController.preview(real_x, real_y, true);
                        } else {
                            PreviewModeController.previewRegion(start_x, start_y, real_x, real_y);
                        }
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                        // intentionally fall-through to select here
                    case 'resize':
                    case 'multiselect':
                        if (rubberBox != null) {
                            rubberBox.setAttribute('display', 'none');
                            curBBoxes = [];
                        }
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                    case 'select':
                        if (selectedElements[0] != null) {
                            // if we only have one selected element
                            if (selectedElements[1] == null) {
                                // set our current stroke/fill properties to the element's
                                var selected = selectedElements[0];
                                switch (selected.tagName) {
                                    case 'g':
                                    case 'use':
                                    case 'image':
                                    case 'foreignObject':
                                        break;
                                    default:
                                        cur_properties.fill = selected.getAttribute('fill');
                                        cur_properties.fill_opacity = selected.getAttribute('fill-opacity');
                                        cur_properties.stroke = selected.getAttribute('stroke');
                                        cur_properties.stroke_opacity = selected.getAttribute('stroke-opacity');
                                        cur_properties.stroke_width = selected.getAttribute('stroke-width');
                                        cur_properties.stroke_dasharray = selected.getAttribute('stroke-dasharray');
                                        cur_properties.stroke_linejoin = selected.getAttribute('stroke-linejoin');
                                        cur_properties.stroke_linecap = selected.getAttribute('stroke-linecap');
                                }

                                if (selected.tagName === 'text') {
                                    cur_text.font_size = selected.getAttribute('font-size');
                                    cur_text.font_family = selected.getAttribute('font-family');
                                }
                                selectorManager.requestSelector(selected).showGrips(true);

                                // This shouldn't be necessary as it was done on mouseDown...
                                //							call('selected', [selected]);
                            }
                            // always recalculate dimensions to strip off stray identity transforms
                            recalculateAllSelectedDimensions();
                            // if it was being dragged/resized
                            if (real_x !== r_start_x || real_y !== r_start_y) {
                                var i, len = selectedElements.length;
                                for (i = 0; i < len; ++i) {
                                    if (selectedElements[i] == null) {
                                        break;
                                    }
                                    if (!selectedElements[i].firstChild) {
                                        // Not needed for groups (incorrectly resizes elems), possibly not needed at all?
                                        selectorManager.requestSelector(selectedElements[i]).resize();
                                    }
                                }
                            }
                            // no change in position/size, so maybe we should move to pathedit
                            else {
                                t = evt.target;
                                if (selectedElements[0].nodeName === 'path' && selectedElements[1] == null) {
                                    pathActions.select(selectedElements[0]);
                                } // if it was a path
                                // else, if it was selected and this is a shift-click, remove it from selection
                                else if (evt.shiftKey) {
                                    if (tempJustSelected !== t) {
                                        canvas.removeFromSelection([t]);
                                    }
                                }
                                const mouse_target = getMouseTarget(evt);
                                const current_layer = getCurrentDrawing().getCurrentLayer();
                                const targetLayer = svgCanvas.getObjectLayer(mouse_target);
                                if (targetLayer && !selectedElements.includes(targetLayer.elem) && targetLayer.elem !== current_layer) {
                                    svgCanvas.setCurrentLayer(targetLayer.title);
                                    window.populateLayers();
                                    selectOnly([mouse_target], true);
                                }
                            } // no change in mouse position

                            // Remove non-scaling stroke
                            if (svgedit.browser.supportsNonScalingStroke()) {
                                var elem = selectedElements[0];
                                if (elem) {
                                    elem.removeAttribute('style');
                                    svgedit.utilities.walkTree(elem, function (elem) {
                                        elem.removeAttribute('style');
                                    });
                                }
                            }

                        }

                        if (selectedElems.length > 1) {
                            svgCanvas.tempGroupSelectedElements();
                            tempGroup = true;
                            window.updateContextPanel();
                            console.log('temp group created');
                        }

                        return;
                        //zoom is broken
                    case 'zoom':
                        if (rubberBox != null) {
                            rubberBox.setAttribute('display', 'none');
                        }
                        call('zoomed');
                        return;
                    case 'fhpath':
                        // Check that the path contains at least 2 points; a degenerate one-point path
                        // causes problems.
                        // Webkit ignores how we set the points attribute with commas and uses space
                        // to separate all coordinates, see https://bugs.webkit.org/show_bug.cgi?id=29870
                        sumDistance = 0;
                        controllPoint2 = {
                            x: 0,
                            y: 0
                        };
                        controllPoint1 = {
                            x: 0,
                            y: 0
                        };
                        start = {
                            x: 0,
                            y: 0
                        };
                        end = {
                            x: 0,
                            y: 0
                        };
                        var coords = element.getAttribute('points');
                        var commaIndex = coords.indexOf(',');
                        if (commaIndex >= 0) {
                            keep = coords.indexOf(',', commaIndex + 1) >= 0;
                        } else {
                            keep = coords.indexOf(' ', coords.indexOf(' ') + 1) >= 0;
                        }
                        if (keep) {
                            element = pathActions.smoothPolylineIntoPath(element);
                        }
                        break;
                    case 'line':
                        attrs = $(element).attr(['x1', 'x2', 'y1', 'y2']);
                        keep = (attrs.x1 !== attrs.x2 || attrs.y1 !== attrs.y2);
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                        break;
                    case 'foreignObject':
                    case 'square':
                    case 'rect':
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                    case 'image':
                        attrs = $(element).attr(['width', 'height']);
                        // Image should be kept regardless of size (use inherit dimensions later)
                        keep = (attrs.width != 0 || attrs.height != 0) || current_mode === 'image';
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                        break;
                    case 'circle':
                        keep = (element.getAttribute('r') != 0);
                        break;
                    case 'ellipse':
                        attrs = $(element).attr(['rx', 'ry']);
                        keep = (attrs.rx != null || attrs.ry != null);
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                        break;
                    case 'fhellipse':
                        if ((freehand.maxx - freehand.minx) > 0 &&
                            (freehand.maxy - freehand.miny) > 0) {
                            element = addSvgElementFromJson({
                                element: 'ellipse',
                                curStyles: true,
                                attr: {
                                    cx: (freehand.minx + freehand.maxx) / 2,
                                    cy: (freehand.miny + freehand.maxy) / 2,
                                    rx: (freehand.maxx - freehand.minx) / 2,
                                    ry: (freehand.maxy - freehand.miny) / 2,
                                    id: getId()
                                }
                            });
                            call('changed', [element]);
                            keep = true;
                        }
                        break;
                    case 'fhrect':
                        if ((freehand.maxx - freehand.minx) > 0 &&
                            (freehand.maxy - freehand.miny) > 0) {
                            element = addSvgElementFromJson({
                                element: 'rect',
                                curStyles: true,
                                attr: {
                                    x: freehand.minx,
                                    y: freehand.miny,
                                    width: (freehand.maxx - freehand.minx),
                                    height: (freehand.maxy - freehand.miny),
                                    id: getId()
                                }
                            });
                            call('changed', [element]);
                            keep = true;
                        }
                        break;
                    case 'text':
                        keep = true;
                        selectOnly([element]);
                        textActions.start(element);
                        break;
                    case 'path':
                        // set element to null here so that it is not removed nor finalized
                        element = null;
                        // continue to be set to true so that mouseMove happens
                        started = true;
                        $('#x_align_line').remove();
                        $('#y_align_line').remove();

                        var res = pathActions.mouseUp(evt, element, mouse_x, mouse_y);
                        element = res.element;
                        keep = res.keep;
                        break;
                    case 'pathedit':
                        keep = true;
                        element = null;
                        $('#x_align_line').remove();
                        $('#y_align_line').remove();
                        pathActions.mouseUp(evt);
                        break;
                    case 'textedit':
                        keep = false;
                        element = null;
                        textActions.mouseUp(evt, mouse_x, mouse_y);
                        break;
                    case 'rotate':
                        keep = true;
                        element = null;
                        current_mode = 'select';
                        $('.tool-btn').removeClass('active');
                        $('#left-Cursor').addClass('active');
                        var batchCmd = canvas.undoMgr.finishUndoableChange();
                        if (!batchCmd.isEmpty()) {
                            addCommandToHistory(batchCmd);
                        }
                        // perform recalculation to weed out any stray identity transforms that might get stuck
                        recalculateAllSelectedDimensions();
                        call('changed', selectedElements);
                        break;
                    default:
                        // This could occur in an extension
                        break;
                }

                if (selectedElems.length > 1) {
                    svgCanvas.tempGroupSelectedElements();
                    tempGroup = true;
                    window.updateContextPanel();
                    console.log('temp group created');
                }

                var ext_result = runExtensions('mouseUp', {
                    event: evt,
                    mouse_x: mouse_x,
                    mouse_y: mouse_y
                }, true);

                $.each(ext_result, function (i, r) {
                    if (r) {
                        keep = r.keep || keep;
                        element = r.element;
                        started = r.started || started;
                    }
                });

                if (!keep && element != null) {
                    getCurrentDrawing().releaseId(getId());
                    element.parentNode.removeChild(element);
                    element = null;
                    t = evt.target;

                    // if this element is in a group, go up until we reach the top-level group
                    // just below the layer groups
                    // TODO: once we implement links, we also would have to check for <a> elements
                    while (t.parentNode.parentNode.tagName === 'g') {
                        t = t.parentNode;
                    }
                    // if we are not in the middle of creating a path, and we've clicked on some shape,
                    // then go to Select mode.
                    // WebKit returns <div> when the canvas is clicked, Firefox/Opera return <svg>
                    if ((current_mode !== 'path' || !drawn_path) &&
                        t.parentNode.id !== 'selectorParentGroup' &&
                        t.id !== 'svgcanvas' && t.id !== 'svgroot') {
                        // switch into "select" mode if we've clicked on an element
                        canvas.setMode('select');
                        selectOnly([t], true);
                    }

                } else if (element != null) {
                    canvas.addedNew = true;

                    if (useUnit) {
                        svgedit.units.convertAttrs(element);
                    }

                    var ani_dur = 0.2,
                        c_ani;
                    if (opac_ani.beginElement && element.getAttribute('opacity') != cur_shape.opacity) {
                        c_ani = $(opac_ani).clone().attr({
                            to: cur_shape.opacity,
                            dur: ani_dur
                        }).appendTo(element);
                        try {
                            // Fails in FF4 on foreignObject
                            c_ani[0].beginElement();
                        } catch (e) {}
                    } else {
                        ani_dur = 0;
                    }

                    // Ideally this would be done on the endEvent of the animation,
                    // but that doesn't seem to be supported in Webkit
                    setTimeout(function () {
                        if (c_ani) {
                            c_ani.remove();
                        }
                        element.setAttribute('opacity', cur_shape.opacity);
                        element.setAttribute('style', 'pointer-events:inherit');
                        cleanupElement(element);
                        if (current_mode === 'path') {
                            pathActions.toEditMode(element);
                        } else if (curConfig.selectNew) {
                            selectOnly([element], true);
                        }
                        // we create the insert command that is stored on the stack
                        // undo means to call cmd.unapply(), redo means to call cmd.apply()
                        addCommandToHistory(new svgedit.history.InsertElementCommand(element));

                        call('changed', [element]);
                    }, ani_dur * 1000);
                }

                startTransform = null;
            };

            var dblClick = function (evt) {
                var evt_target = evt.target;
                var parent = evt_target.parentNode;

                // Do nothing if already in current group
                if (parent === current_group) {
                    return;
                }

                var mouse_target = getMouseTarget(evt);
                var tagName = mouse_target.tagName;

                if (tagName === 'text' && current_mode !== 'textedit') {
                    var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm);
                    textActions.select(mouse_target, pt.x, pt.y);
                }

                if ((tagName === 'g' || tagName === 'a') && svgedit.utilities.getRotationAngle(mouse_target)) {
                    // TODO: Allow method of in-group editing without having to do
                    // this (similar to editing rotated paths)

                    // Ungroup and regroup
                    pushGroupProperties(mouse_target);
                    mouse_target = selectedElements[0];
                    clearSelection(true);
                }
                // Reset context
                if (current_group) {
                    leaveContext();
                }

                if ((parent.tagName !== 'g' && parent.tagName !== 'a') ||
                    parent === getCurrentDrawing().getCurrentLayer() ||
                    mouse_target === selectorManager.selectorParentGroup) {
                    // Escape from in-group edit
                    return;
                }
                setContext(mouse_target);
            };

            // prevent links from being followed in the canvas
            var handleLinkInCanvas = function (e) {
                e.preventDefault();
                return false;
            };

            // Added mouseup to the container here.
            // TODO(codedread): Figure out why after the Closure compiler, the window mouseup is ignored.
            $(container).mousedown(mouseDown).mousemove(mouseMove).click(handleLinkInCanvas).dblclick(dblClick).mouseup(mouseUp);
            //	$(window).mouseup(mouseUp);

            //TODO(rafaelcastrocouto): User preference for shift key and zoom factor

            $(container).bind('wheel DOMMouseScroll', (function () {
                let targetZoom;
                let timer;
                let trigger = Date.now();

                return function (e) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    const evt = e.originalEvent;
                    evt.stopImmediatePropagation();
                    evt.preventDefault();

                    if (targetZoom === undefined) {
                        targetZoom = svgCanvas.getZoom();
                    }

                    const mouseInputDevice = BeamboxPreference.read('mouse_input_device');
                    const isTouchpad = (mouseInputDevice === 'TOUCHPAD');

                    if (isTouchpad) {
                        if (e.ctrlKey) {
                            _zoomAsIllustrator();
                        } else {
                            _panAsIllustrator();
                        }
                    } else {
                        _zoomAsIllustrator();
                        //panning is default behavior when pressing middle button
                    }

                    function _zoomProcess() {
                        // End of animation
                        const currentZoom = svgCanvas.getZoom();
                        if ((currentZoom === targetZoom) || (Date.now() - trigger > 500)) {
                            clearInterval(timer);
                            timer = undefined;
                            return;
                        }

                        // Calculate next animation zoom level
                        var nextZoom = currentZoom + (targetZoom - currentZoom) / 5;

                        if (Math.abs(targetZoom - currentZoom) < 0.005) {
                            nextZoom = targetZoom;
                        }

                        const cursorPosition = {
                            x: evt.pageX,
                            y: evt.pageY
                        };

                        call('zoomed', {
                            zoomLevel: nextZoom,
                            staticPoint: cursorPosition
                        });
                    }

                    function _zoomAsIllustrator() {
                        const delta = (evt.wheelDelta) ? evt.wheelDelta : (evt.detail) ? -evt.detail : 0;

                        targetZoom *= (1 + delta * targetZoom**1.1 / 2000.0);

                        targetZoom = Math.min(20, targetZoom);
                        targetZoom = Math.max(0.1, targetZoom);
                        if((targetZoom > 19 ) && (delta > 0)) {
                            return;
                        }

                        if (!timer) {
                            const interval = 20;
                            timer = setInterval(_zoomProcess, interval);
                        }

                        // due to wheel event bug (which zoom gesture will sometimes block all other processes), we trigger the zoomProcess about every few miliseconds
                        if (Date.now() - trigger > 20) {
                            _zoomProcess();
                            trigger = Date.now();
                        }
                    }

                    function _panAsIllustrator() {
                        requestAnimationFrame(() => {
                            const scrollLeft = $('#workarea').scrollLeft() + evt.deltaX / 2.0;
                            const scrollTop = $('#workarea').scrollTop() + evt.deltaY / 2.0;
                            $('#workarea').scrollLeft(scrollLeft);
                            $('#workarea').scrollTop(scrollTop);
                        });
                    }
                };
            })());

        })();


        // Group: Text edit functions
        // Functions relating to editing text elements
        textActions = canvas.textActions = (function () {
            var curtext;
            var textinput;
            var cursor;
            var selblock;
            var blinker;
            var chardata = [];
            var textbb, transbb;
            var matrix;
            var last_x, last_y;
            var allow_dbl;

            function setCursor(index) {
                var empty = (textinput.value === '');
                $(textinput).focus();

                if (!arguments.length) {
                    if (empty) {
                        index = 0;
                    } else {
                        if (textinput.selectionEnd !== textinput.selectionStart) {
                            return;
                        }
                        index = textinput.selectionEnd;
                    }
                }

                var charbb;
                charbb = chardata[index];
                if (!empty) {
                    textinput.setSelectionRange(index, index);
                }
                cursor = svgedit.utilities.getElem('text_cursor');
                if (!cursor) {
                    cursor = document.createElementNS(NS.SVG, 'line');
                    svgedit.utilities.assignAttributes(cursor, {
                        id: 'text_cursor',
                        stroke: '#333',
                        'stroke-width': 1
                    });
                    cursor = svgedit.utilities.getElem('selectorParentGroup').appendChild(cursor);
                }

                if (!blinker) {
                    blinker = setInterval(function () {
                        var show = (cursor.getAttribute('display') === 'none');
                        cursor.setAttribute('display', show ? 'inline' : 'none');
                    }, 600);
                }

                var start_pt = ptToScreen(charbb.x, textbb.y);
                var end_pt = ptToScreen(charbb.x, (textbb.y + textbb.height));

                svgedit.utilities.assignAttributes(cursor, {
                    x1: start_pt.x,
                    y1: start_pt.y,
                    x2: end_pt.x,
                    y2: end_pt.y,
                    visibility: 'visible',
                    display: 'inline'
                });

                if (selblock) {
                    selblock.setAttribute('d', '');
                }
            }

            function setSelection(start, end, skipInput) {
                if (start === end) {
                    setCursor(end);
                    return;
                }

                if (!skipInput) {
                    textinput.setSelectionRange(start, end);
                }

                selblock = svgedit.utilities.getElem('text_selectblock');
                if (!selblock) {

                    selblock = document.createElementNS(NS.SVG, 'path');
                    svgedit.utilities.assignAttributes(selblock, {
                        id: 'text_selectblock',
                        fill: 'green',
                        opacity: 0.5,
                        style: 'pointer-events:none'
                    });
                    svgedit.utilities.getElem('selectorParentGroup').appendChild(selblock);
                }

                var startbb = chardata[start];
                var endbb = chardata[end];

                cursor.setAttribute('visibility', 'hidden');

                var tl = ptToScreen(startbb.x, textbb.y),
                    tr = ptToScreen(startbb.x + (endbb.x - startbb.x), textbb.y),
                    bl = ptToScreen(startbb.x, textbb.y + textbb.height),
                    br = ptToScreen(startbb.x + (endbb.x - startbb.x), textbb.y + textbb.height);

                var dstr = 'M' + tl.x + ',' + tl.y +
                    ' L' + tr.x + ',' + tr.y +
                    ' ' + br.x + ',' + br.y +
                    ' ' + bl.x + ',' + bl.y + 'z';

                svgedit.utilities.assignAttributes(selblock, {
                    d: dstr,
                    'display': 'inline'
                });
            }

            function getIndexFromPoint(mouse_x, mouse_y) {
                // Position cursor here
                var pt = svgroot.createSVGPoint();
                pt.x = mouse_x;
                pt.y = mouse_y;

                // No content, so return 0
                if (chardata.length === 1) {
                    return 0;
                }
                // Determine if cursor should be on left or right of character
                var charpos = curtext.getCharNumAtPosition(pt);
                if (charpos < 0) {
                    // Out of text range, look at mouse coords
                    charpos = chardata.length - 2;
                    if (mouse_x <= chardata[0].x) {
                        charpos = 0;
                    }
                } else if (charpos >= chardata.length - 2) {
                    charpos = chardata.length - 2;
                }
                var charbb = chardata[charpos];
                var mid = charbb.x + (charbb.width / 2);
                if (mouse_x > mid) {
                    charpos++;
                }
                return charpos;
            }

            function setCursorFromPoint(mouse_x, mouse_y) {
                setCursor(getIndexFromPoint(mouse_x, mouse_y));
            }

            function setEndSelectionFromPoint(x, y, apply) {
                var i1 = textinput.selectionStart;
                var i2 = getIndexFromPoint(x, y);

                var start = Math.min(i1, i2);
                var end = Math.max(i1, i2);
                setSelection(start, end, !apply);
            }

            function screenToPt(x_in, y_in) {
                var out = {
                    x: x_in,
                    y: y_in
                };

                out.x /= current_zoom;
                out.y /= current_zoom;

                if (matrix) {
                    var pt = svgedit.math.transformPoint(out.x, out.y, matrix.inverse());
                    out.x = pt.x;
                    out.y = pt.y;
                }

                return out;
            }

            function ptToScreen(x_in, y_in) {
                var out = {
                    x: x_in,
                    y: y_in
                };

                if (matrix) {
                    var pt = svgedit.math.transformPoint(out.x, out.y, matrix);
                    out.x = pt.x;
                    out.y = pt.y;
                }

                out.x *= current_zoom;
                out.y *= current_zoom;

                return out;
            }

            function hideCursor() {
                if (cursor) {
                    cursor.setAttribute('visibility', 'hidden');
                }
            }

            function selectAll(evt) {
                setSelection(0, curtext.textContent.length);
                $(this).unbind(evt);
            }

            function selectWord(evt) {
                if (!allow_dbl || !curtext) {
                    return;
                }

                var ept = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm),
                    mouse_x = ept.x * current_zoom,
                    mouse_y = ept.y * current_zoom;
                var pt = screenToPt(mouse_x, mouse_y);

                var index = getIndexFromPoint(pt.x, pt.y);
                var str = curtext.textContent;
                var first = str.substr(0, index).replace(/[a-z0-9]+$/i, '').length;
                var m = str.substr(index).match(/^[a-z0-9]+/i);
                var last = (m ? m[0].length : 0) + index;
                setSelection(first, last);

                // Set tripleclick
                $(evt.target).click(selectAll);
                setTimeout(function () {
                    $(evt.target).unbind('click', selectAll);
                }, 300);

            }

            return {
                select: function (target, x, y) {
                    curtext = target;
                    textActions.toEditMode(x, y);
                },
                start: function (elem) {
                    curtext = elem;
                    textActions.toEditMode();
                },
                mouseDown: function (evt, mouse_target, start_x, start_y) {
                    var pt = screenToPt(start_x, start_y);

                    textinput.focus();
                    setCursorFromPoint(pt.x, pt.y);
                    last_x = start_x;
                    last_y = start_y;

                    // TODO: Find way to block native selection
                },
                mouseMove: function (mouse_x, mouse_y) {
                    var pt = screenToPt(mouse_x, mouse_y);
                    setEndSelectionFromPoint(pt.x, pt.y);
                },
                mouseUp: function (evt, mouse_x, mouse_y) {
                    var pt = screenToPt(mouse_x, mouse_y);

                    setEndSelectionFromPoint(pt.x, pt.y, true);

                    // TODO: Find a way to make this work: Use transformed BBox instead of evt.target
                    //				if (last_x === mouse_x && last_y === mouse_y
                    //					&& !svgedit.math.rectsIntersect(transbb, {x: pt.x, y: pt.y, width:0, height:0})) {
                    //					textActions.toSelectMode(true);
                    //				}

                    if (
                        evt.target !== curtext &&
                        mouse_x < last_x + 2 &&
                        mouse_x > last_x - 2 &&
                        mouse_y < last_y + 2 &&
                        mouse_y > last_y - 2) {

                        textActions.toSelectMode(true);
                    }

                },
                setCursor: setCursor,
                toEditMode: function (x, y) {
                    allow_dbl = false;
                    current_mode = 'textedit';
                    selectorManager.requestSelector(curtext).showGrips(false);
                    // Make selector group accept clicks
                    var sel = selectorManager.requestSelector(curtext).selectorRect;

                    textActions.init();

                    $(curtext).css('cursor', 'text');

                    //				if (svgedit.browser.supportsEditableText()) {
                    //					curtext.setAttribute('editable', 'simple');
                    //					return;
                    //				}

                    if (!arguments.length) {
                        setCursor();
                    } else {
                        var pt = screenToPt(x, y);
                        setCursorFromPoint(pt.x, pt.y);
                    }

                    setTimeout(function () {
                        allow_dbl = true;
                    }, 300);
                },
                toSelectMode: function (selectElem) {
                    current_mode = 'select';
                    $('.tool-btn').removeClass('active');
                    $('#left-Cursor').addClass('active');
                    clearInterval(blinker);
                    blinker = null;
                    if (selblock) {
                        $(selblock).attr('display', 'none');
                    }
                    if (cursor) {
                        $(cursor).attr('visibility', 'hidden');
                    }
                    $(curtext).css('cursor', 'move');

                    if (selectElem) {
                        clearSelection();
                        $(curtext).css('cursor', 'move');

                        call('selected', [curtext]);
                        addToSelection([curtext], true);
                    }
                    if (curtext && !curtext.textContent.length) {
                        // No content, so delete
                        canvas.deleteSelectedElements();
                    }

                    $(textinput).blur();

                    curtext = false;

                    //				if (svgedit.browser.supportsEditableText()) {
                    //					curtext.removeAttribute('editable');
                    //				}
                },
                setInputElem: function (elem) {
                    textinput = elem;
                    //			$(textinput).blur(hideCursor);
                },
                clear: function () {
                    if (current_mode === 'textedit') {
                        textActions.toSelectMode();
                    }
                },
                init: function (inputElem) {
                    if (!curtext) {
                        return;
                    }
                    var i, end;
                    //				if (svgedit.browser.supportsEditableText()) {
                    //					curtext.select();
                    //					return;
                    //				}

                    if (!curtext.parentNode) {
                        // Result of the ffClone, need to get correct element
                        curtext = selectedElements[0];
                        selectorManager.requestSelector(curtext).showGrips(false);
                    }

                    var str = curtext.textContent;
                    var len = str.length;

                    var xform = curtext.getAttribute('transform');

                    textbb = svgedit.utilities.getBBox(curtext);

                    matrix = xform ? svgedit.math.getMatrix(curtext) : null;

                    chardata = [];
                    chardata.length = len;
                    textinput.focus();

                    $(curtext).unbind('dblclick', selectWord).dblclick(selectWord);

                    if (!len) {
                        end = {
                            x: textbb.x + (textbb.width / 2),
                            width: 0
                        };
                    }

                    for (i = 0; i < len; i++) {
                        var start = curtext.getStartPositionOfChar(i);
                        end = curtext.getEndPositionOfChar(i);

                        if (!svgedit.browser.supportsGoodTextCharPos()) {
                            var offset = canvas.contentW * current_zoom;
                            start.x -= offset;
                            end.x -= offset;

                            start.x /= current_zoom;
                            end.x /= current_zoom;
                        }

                        // Get a "bbox" equivalent for each character. Uses the
                        // bbox data of the actual text for y, height purposes

                        // TODO: Decide if y, width and height are actually necessary
                        chardata[i] = {
                            x: start.x,
                            y: textbb.y, // start.y?
                            width: end.x - start.x,
                            height: textbb.height
                        };
                    }

                    // Add a last bbox for cursor at end of text
                    chardata.push({
                        x: end.x,
                        width: 0
                    });
                    setSelection(textinput.selectionStart, textinput.selectionEnd, true);
                }
            };
        })();

        // TODO: Migrate all of this code into path.js
        // Group: Path edit functions
        // Functions relating to editing path elements
        pathActions = canvas.pathActions = (function () {

            var subpath = false;
            var current_path;
            var newPoint, firstCtrl;

            function resetD(p) {
                p.setAttribute('d', pathActions.convertPath(p));
            }

            // TODO: Move into path.js
            svgedit.path.Path.prototype.endChanges = function (text) {
                if (svgedit.browser.isWebkit()) {
                    resetD(this.elem);
                }
                var cmd = new svgedit.history.ChangeElementCommand(this.elem, {
                    d: this.last_d
                }, text);
                addCommandToHistory(cmd);
                call('changed', [this.elem]);
            };

            svgedit.path.Path.prototype.addPtsToSelection = function (indexes) {
                var i, seg;
                if (!$.isArray(indexes)) {
                    indexes = [indexes];
                }
                for (i = 0; i < indexes.length; i++) {
                    var index = indexes[i];
                    seg = this.segs[index];
                    if (seg.ptgrip) {
                        if (this.selected_pts.indexOf(index) === -1 && index >= 0) {
                            this.selected_pts.push(index);
                        }
                    }
                }
                this.selected_pts.sort();
                i = this.selected_pts.length;
                var grips = [];
                grips.length = i;
                // Loop through points to be selected and highlight each
                while (i--) {
                    var pt = this.selected_pts[i];
                    seg = this.segs[pt];
                    seg.select(true);
                    grips[i] = seg.ptgrip;
                }
                // TODO: Correct this:
                pathActions.canDeleteNodes = true;

                pathActions.closed_subpath = this.subpathIsClosed(this.selected_pts[0]);

                call('selected', grips);
            };

            current_path = null;
            var drawn_path = null,
                hasMoved = false;

            // This function converts a polyline (created by the fh_path tool) into
            // a path element and coverts every three line segments into a single bezier
            // curve in an attempt to smooth out the free-hand
            var smoothPolylineIntoPath = function (element) {
                var i, points = element.points;
                var N = points.numberOfItems;
                if (N >= 4) {
                    // loop through every 3 points and convert to a cubic bezier curve segment
                    //
                    // NOTE: this is cheating, it means that every 3 points has the potential to
                    // be a corner instead of treating each point in an equal manner. In general,
                    // this technique does not look that good.
                    //
                    // I am open to better ideas!
                    //
                    // Reading:
                    // - http://www.efg2.com/Lab/Graphics/Jean-YvesQueinecBezierCurves.htm
                    // - http://www.codeproject.com/KB/graphics/BezierSpline.aspx?msg=2956963
                    // - http://www.ian-ko.com/ET_GeoWizards/UserGuide/smooth.htm
                    // - http://www.cs.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/Bezier/bezier-der.html
                    var curpos = points.getItem(0),
                        prevCtlPt = null;
                    var d = [];
                    d.push(['M', curpos.x, ',', curpos.y, ' C'].join(''));
                    for (i = 1; i <= (N - 4); i += 3) {
                        var ct1 = points.getItem(i);
                        var ct2 = points.getItem(i + 1);
                        var end = points.getItem(i + 2);

                        // if the previous segment had a control point, we want to smooth out
                        // the control points on both sides
                        if (prevCtlPt) {
                            var newpts = svgedit.path.smoothControlPoints(prevCtlPt, ct1, curpos);
                            if (newpts && newpts.length === 2) {
                                var prevArr = d[d.length - 1].split(',');
                                prevArr[2] = newpts[0].x;
                                prevArr[3] = newpts[0].y;
                                d[d.length - 1] = prevArr.join(',');
                                ct1 = newpts[1];
                            }
                        }

                        d.push([ct1.x, ct1.y, ct2.x, ct2.y, end.x, end.y].join(','));

                        curpos = end;
                        prevCtlPt = ct2;
                    }
                    // handle remaining line segments
                    d.push('L');
                    while (i < N) {
                        var pt = points.getItem(i);
                        d.push([pt.x, pt.y].join(','));
                        i++;
                    }
                    d = d.join(' ');

                    // create new path element
                    element = addSvgElementFromJson({
                        element: 'path',
                        curStyles: true,
                        attr: {
                            id: getId(),
                            d: d,
                            fill: 'none'
                        }
                    });
                    // No need to call "changed", as this is already done under mouseUp
                }
                return element;
            };

            return {
                mouseDown: function (evt, mouse_target, start_x, start_y) {
                    var id;
                    $('#x_align_line').remove();
                    $('#y_align_line').remove();
                    if (current_mode === 'path') {
                        mouse_x = start_x;
                        mouse_y = start_y;

                        var x = mouse_x / current_zoom,
                            y = mouse_y / current_zoom,
                            stretchy = svgedit.utilities.getElem('path_stretch_line');
                        newPoint = [x, y];
                        if (canvas.isBezierPathAlignToEdge) {
                            canvas.addAlignPoint(x, y);
                        }
                        if (curConfig.gridSnapping) {
                            x = svgedit.utilities.snapToGrid(x);
                            y = svgedit.utilities.snapToGrid(y);
                            mouse_x = svgedit.utilities.snapToGrid(mouse_x);
                            mouse_y = svgedit.utilities.snapToGrid(mouse_y);
                        }

                        if (!stretchy) {
                            stretchy = document.createElementNS(NS.SVG, 'path');
                            svgedit.utilities.assignAttributes(stretchy, {
                                id: 'path_stretch_line',
                                stroke: '#22C',
                                'stroke-width': '0.5',
                                fill: 'none'
                            });
                            stretchy = svgedit.utilities.getElem('selectorParentGroup').appendChild(stretchy);
                        }
                        stretchy.setAttribute('display', 'inline');

                        var keep = null;
                        var index;
                        // if pts array is empty, create path element with M at current point
                        if (!drawn_path) {
                            d_attr = 'M' + x + ',' + y + ' ';
                            drawn_path = addSvgElementFromJson({
                                element: 'path',
                                curStyles: true,
                                attr: {
                                    d: d_attr,
                                    id: getNextId(),
                                    'stroke-width' : 1,
                                    opacity: cur_shape.opacity / 2
                                }
                            });
                            if (canvas.isUseLayerColor) {
                                canvas.updateElementColor(drawn_path);
                            }
                            // set stretchy line to first point
                            stretchy.setAttribute('d', ['M', mouse_x, mouse_y, mouse_x, mouse_y].join(' '));
                            index = subpath ? svgedit.path.path.segs.length : 0;
                            svgedit.path.addPointGrip(index, mouse_x, mouse_y);
                            shortcuts.off(['esc']);
                            shortcuts.on(['esc'], function() {
                                $('#x_align_line').remove();
                                $('#y_align_line').remove();
                                id = getId();
                                firstCtrl = null;
                                svgedit.path.removePath_(id);
                                let element = svgedit.utilities.getElem(id);
                                $(stretchy).remove();
                                let len = drawn_path.pathSegList.numberOfItems;
                                drawn_path = null;
                                started = false;
                                if (len > 1) {
                                    element.setAttribute('opacity', cur_shape.opacity);
                                    element.setAttribute('style', 'pointer-events:inherit');
                                    cleanupElement(element);
                                    pathActions.toEditMode(element);
                                    addCommandToHistory(new svgedit.history.InsertElementCommand(element));
                                    call('changed', [element]);
                                } else {
                                    $(element).remove();
                                    $('#pathpointgrip_container').remove();
                                    current_mode = 'select';
                                    $('.tool-btn').removeClass('active');
                                    $('#left-Cursor').addClass('active');
                                }

                                shortcuts.off(['esc']);
                                shortcuts.on(['esc'], svgEditor.clickSelect);
                            });
                        } else {
                            // determine if we clicked on an existing point
                            var seglist = drawn_path.pathSegList;
                            var i = seglist.numberOfItems;
                            var FUZZ = 6 / current_zoom;
                            var clickOnPoint = false;
                            while (i) {
                                i--;
                                var item = seglist.getItem(i);
                                var px = item.x,
                                    py = item.y;
                                // found a matching point
                                if (x >= (px - FUZZ) && x <= (px + FUZZ) && y >= (py - FUZZ) && y <= (py + FUZZ)) {
                                    clickOnPoint = true;
                                    break;
                                }
                            }

                            // get path element that we are in the process of creating
                            id = getId();

                            // Remove previous path object if previously created
                            svgedit.path.removePath_(id);

                            var newpath = svgedit.utilities.getElem(id);
                            var newseg;
                            var s_seg;
                            var len = seglist.numberOfItems;
                            // if we clicked on an existing point, then we are done this path, commit it
                            // (i, i+1) are the x,y that were clicked on
                            if (clickOnPoint) {
                                // if clicked on any other point but the first OR
                                // the first point was clicked on and there are less than 3 points
                                // then leave the path open
                                // otherwise, close the path
                                if (i === 0 && len >= 2) {
                                    // Create end segment
                                    var abs_x = seglist.getItem(0).x;
                                    var abs_y = seglist.getItem(0).y;


                                    s_seg = stretchy.pathSegList.getItem(1);
                                    if (s_seg.pathSegType === 4) {
                                        newseg = drawn_path.createSVGPathSegLinetoAbs(abs_x, abs_y);
                                    } else {
                                        newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
                                            abs_x,
                                            abs_y,
                                            s_seg.x1 / current_zoom,
                                            s_seg.y1 / current_zoom,
                                            abs_x,
                                            abs_y
                                        );
                                    }

                                    var endseg = drawn_path.createSVGPathSegClosePath();
                                    seglist.appendItem(newseg);
                                    seglist.appendItem(endseg);
                                } else if (len < 2) {
                                    keep = false;
                                    return keep;
                                }
                                $(stretchy).remove();

                                // This will signal to commit the path
                                element = newpath;
                                drawn_path = null;
                                started = false;

                                if (subpath) {
                                    if (svgedit.path.path.matrix) {
                                        svgedit.coords.remapElement(newpath, {}, svgedit.path.path.matrix.inverse());
                                    }

                                    var new_d = newpath.getAttribute('d');
                                    var orig_d = $(svgedit.path.path.elem).attr('d');
                                    $(svgedit.path.path.elem).attr('d', orig_d + new_d);
                                    $(newpath).remove();
                                    if (svgedit.path.path.matrix) {
                                        svgedit.path.recalcRotatedPath();
                                    }
                                    svgedit.path.path.init();
                                    pathActions.toEditMode(svgedit.path.path.elem);
                                    svgedit.path.path.selectPt();
                                    return false;
                                }
                            }
                            // else, create a new point, update path element
                            else {
                                // Checks if current target or parents are #svgcontent
                                if (!$.contains(container, getMouseTarget(evt))) {
                                    // Clicked outside canvas, so don't make point
                                    console.log('Clicked outside canvas');
                                    return false;
                                }

                                var num = drawn_path.pathSegList.numberOfItems;
                                var last = drawn_path.pathSegList.getItem(num - 1);
                                var lastx = last.x,
                                    lasty = last.y;

                                if (evt.shiftKey) {
                                    var xya = svgedit.math.snapToAngle(lastx, lasty, x, y);
                                    x = xya.x;
                                    y = xya.y;
                                }

                                // Use the segment defined by stretchy
                                s_seg = stretchy.pathSegList.getItem(1);
                                if (s_seg.pathSegType === 4) {
                                    newseg = drawn_path.createSVGPathSegLinetoAbs(round(x), round(y));
                                } else {
                                    newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
                                        round(x),
                                        round(y),
                                        s_seg.x1 / current_zoom,
                                        s_seg.y1 / current_zoom,
                                        s_seg.x2 / current_zoom,
                                        s_seg.y2 / current_zoom
                                    );
                                }

                                drawn_path.pathSegList.appendItem(newseg);

                                x *= current_zoom;
                                y *= current_zoom;

                                // set stretchy line to latest point
                                stretchy.setAttribute('d', ['M', x, y, x, y].join(' '));
                                index = num;
                                if (subpath) {
                                    index += svgedit.path.path.segs.length;
                                }
                                svgedit.path.addPointGrip(index, x, y);
                            }
                            //					keep = true;
                        }

                        return;
                    }

                    // TODO: Make sure current_path isn't null at this point
                    if (!svgedit.path.path) {
                        return;
                    }

                    svgedit.path.path.storeD();

                    id = evt.target.id;
                    var cur_pt;
                    if (id.substr(0, 14) === 'pathpointgrip_') {
                        // Select this point
                        cur_pt = svgedit.path.path.cur_pt = parseInt(id.substr(14));
                        svgedit.path.path.dragging = [start_x, start_y];
                        var seg = svgedit.path.path.segs[cur_pt];

                        // only clear selection if shift is not pressed (otherwise, add
                        // node to selection)
                        if (!evt.shiftKey) {
                            if (svgedit.path.path.selected_pts.length <= 1 || !seg.selected) {
                                svgedit.path.path.clearSelection();
                            }
                            svgedit.path.path.addPtsToSelection(cur_pt);
                        } else if (seg.selected) {
                            svgedit.path.path.removePtFromSelection(cur_pt);
                        } else {
                            svgedit.path.path.addPtsToSelection(cur_pt);
                        }
                    } else if (id.indexOf('ctrlpointgrip_') === 0) {
                        svgedit.path.path.dragging = [start_x, start_y];

                        var parts = id.split('_')[1].split('c');
                        cur_pt = Number(parts[0]);
                        var ctrl_num = Number(parts[1]);
                        svgedit.path.path.selectPt(cur_pt, ctrl_num);
                    }

                    // Start selection box
                    if (!svgedit.path.path.dragging) {
                        if (rubberBox == null) {
                            rubberBox = selectorManager.getRubberBandBox();
                        }
                        svgedit.utilities.assignAttributes(rubberBox, {
                            'x': start_x * current_zoom,
                            'y': start_y * current_zoom,
                            'width': 0,
                            'height': 0,
                            'display': 'inline'
                        }, 100);
                    }
                },
                mouseMove: function (mouse_x, mouse_y) {
                    hasMoved = true;
                    if (current_mode === 'path') {
                        if (!drawn_path) {
                            return;
                        }
                        var seglist = drawn_path.pathSegList;
                        var index = seglist.numberOfItems - 1;

                        if (newPoint) {
                            // First point
                            //					if (!index) {return;}

                            // Set control points
                            var pointGrip1 = svgedit.path.addCtrlGrip('1c1');
                            var pointGrip2 = svgedit.path.addCtrlGrip('0c2');

                            // dragging pointGrip1
                            pointGrip1.setAttribute('cx', mouse_x);
                            pointGrip1.setAttribute('cy', mouse_y);
                            pointGrip1.setAttribute('display', 'inline');

                            var pt_x = newPoint[0];
                            var pt_y = newPoint[1];

                            // set curve
                            var seg = seglist.getItem(index);
                            var cur_x = mouse_x / current_zoom;
                            var cur_y = mouse_y / current_zoom;
                            var alt_x = (pt_x + (pt_x - cur_x));
                            var alt_y = (pt_y + (pt_y - cur_y));

                            pointGrip2.setAttribute('cx', alt_x * current_zoom);
                            pointGrip2.setAttribute('cy', alt_y * current_zoom);
                            pointGrip2.setAttribute('display', 'inline');

                            var ctrlLine = svgedit.path.getCtrlLine(1);
                            svgedit.utilities.assignAttributes(ctrlLine, {
                                x1: mouse_x,
                                y1: mouse_y,
                                x2: alt_x * current_zoom,
                                y2: alt_y * current_zoom,
                                display: 'inline'
                            });

                            if (index === 0) {
                                firstCtrl = [mouse_x, mouse_y];
                            } else {
                                var last = seglist.getItem(index - 1);
                                var last_x = last.x;
                                var last_y = last.y;

                                if (last.pathSegType === 6) {
                                    last_x += (last_x - last.x2);
                                    last_y += (last_y - last.y2);
                                } else if (firstCtrl) {
                                    last_x = firstCtrl[0] / current_zoom;
                                    last_y = firstCtrl[1] / current_zoom;
                                }
                                svgedit.path.replacePathSeg(6, index, [pt_x, pt_y, last_x, last_y, alt_x, alt_y], drawn_path);
                            }
                        } else {
                            var stretchy = svgedit.utilities.getElem('path_stretch_line');
                            if (stretchy) {
                                var prev = seglist.getItem(index);
                                if (prev.pathSegType === 6) {
                                    var prev_x = prev.x + (prev.x - prev.x2);
                                    var prev_y = prev.y + (prev.y - prev.y2);
                                    svgedit.path.replacePathSeg(6, 1, [mouse_x, mouse_y, prev_x * current_zoom, prev_y * current_zoom, mouse_x, mouse_y], stretchy);
                                } else if (firstCtrl) {
                                    svgedit.path.replacePathSeg(6, 1, [mouse_x, mouse_y, firstCtrl[0], firstCtrl[1], mouse_x, mouse_y], stretchy);
                                } else {
                                    svgedit.path.replacePathSeg(4, 1, [mouse_x, mouse_y], stretchy);
                                }
                            }
                        }
                        return;
                    }
                    // if we are dragging a point, let's move it
                    if (svgedit.path.path.dragging) {
                        var pt = svgedit.path.getPointFromGrip({
                            x: svgedit.path.path.dragging[0],
                            y: svgedit.path.path.dragging[1]
                        }, svgedit.path.path);
                        var mpt = svgedit.path.getPointFromGrip({
                            x: mouse_x,
                            y: mouse_y
                        }, svgedit.path.path);
                        var diff_x = mpt.x - pt.x;
                        var diff_y = mpt.y - pt.y;
                        svgedit.path.path.dragging = [mouse_x, mouse_y];

                        if (svgedit.path.path.dragctrl) {
                            svgedit.path.path.moveCtrl(diff_x, diff_y);
                        } else {
                            svgedit.path.path.movePts(diff_x, diff_y);
                        }
                    } else {
                        svgedit.path.path.selected_pts = [];
                        svgedit.path.path.eachSeg(function (i) {
                            var seg = this;
                            if (!seg.next && !seg.prev) {
                                return;
                            }

                            var item = seg.item;
                            var rbb = rubberBox.getBBox();

                            var pt = svgedit.path.getGripPt(seg);
                            var pt_bb = {
                                x: pt.x,
                                y: pt.y,
                                width: 0,
                                height: 0
                            };

                            var sel = svgedit.math.rectsIntersect(rbb, pt_bb);

                            this.select(sel);
                            //Note that addPtsToSelection is not being run
                            if (sel) {
                                svgedit.path.path.selected_pts.push(seg.index);
                            }
                        });

                    }
                },
                mouseUp: function (evt, element, mouse_x, mouse_y) {
                    // Create mode
                    if (current_mode === 'path') {
                        newPoint = null;
                        if (!drawn_path) {
                            element = svgedit.utilities.getElem(getId());
                            started = false;
                            firstCtrl = null;
                        }

                        return {
                            keep: true,
                            element: element
                        };
                    }

                    // Edit mode

                    if (svgedit.path.path.dragging) {
                        var last_pt = svgedit.path.path.cur_pt;

                        svgedit.path.path.dragging = false;
                        svgedit.path.path.dragctrl = false;
                        svgedit.path.path.update();

                        if (hasMoved) {
                            svgedit.path.path.endChanges('Move path point(s)');
                        }

                        if (!evt.shiftKey && !hasMoved) {
                            svgedit.path.path.selectPt(last_pt);
                        }
                    } else if (rubberBox && rubberBox.getAttribute('display') !== 'none') {
                        // Done with multi-node-select
                        rubberBox.setAttribute('display', 'none');

                        if (rubberBox.getAttribute('width') <= 2 && rubberBox.getAttribute('height') <= 2) {
                            pathActions.toSelectMode(evt.target);
                        }

                        // else, move back to select mode
                    } else {
                        pathActions.toSelectMode(evt.target);
                    }
                    hasMoved = false;
                },
                toEditMode: function (element) {
                    svgedit.path.path = svgedit.path.getPath_(element);
                    current_mode = 'pathedit';
                    clearSelection();
                    svgedit.path.path.show(true).update();
                    svgedit.path.path.oldbbox = svgedit.utilities.getBBox(svgedit.path.path.elem);
                    subpath = false;
                },
                toSelectMode: function (elem) {
                    var selPath = (elem === svgedit.path.path.elem);
                    current_mode = 'select';
                    $('.tool-btn').removeClass('active');
                    $('#left-Cursor').addClass('active');
                    svgedit.path.path.show(false);
                    current_path = false;
                    clearSelection();

                    if (svgedit.path.path.matrix) {
                        // Rotated, so may need to re-calculate the center
                        svgedit.path.recalcRotatedPath();
                    }

                    if (selPath) {
                        call('selected', [elem]);
                        addToSelection([elem], true);
                    }
                },
                addSubPath: function (on) {
                    if (on) {
                        // Internally we go into "path" mode, but in the UI it will
                        // still appear as if in "pathedit" mode.
                        current_mode = 'path';
                        subpath = true;
                    } else {
                        pathActions.clear(true);
                        pathActions.toEditMode(svgedit.path.path.elem);
                    }
                },
                select: function (target) {
                    if (current_path === target) {
                        pathActions.toEditMode(target);
                        current_mode = 'pathedit';
                    } // going into pathedit mode
                    else {
                        current_path = target;
                    }
                },
                reorient: function () {
                    var elem = selectedElements[0];
                    if (!elem) {
                        return;
                    }
                    var angle = svgedit.utilities.getRotationAngle(elem);
                    if (angle == 0) {
                        return;
                    }

                    var batchCmd = new svgedit.history.BatchCommand('Reorient path');
                    var changes = {
                        d: elem.getAttribute('d'),
                        transform: elem.getAttribute('transform')
                    };
                    batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
                    clearSelection();
                    this.resetOrientation(elem);

                    addCommandToHistory(batchCmd);

                    // Set matrix to null
                    svgedit.path.getPath_(elem).show(false).matrix = null;

                    this.clear();

                    addToSelection([elem], true);
                    call('changed', selectedElements);
                },

                clear: function (remove) {
                    current_path = null;
                    if (drawn_path) {
                        var elem = svgedit.utilities.getElem(getId());
                        $(svgedit.utilities.getElem('path_stretch_line')).remove();
                        $(elem).remove();
                        $(svgedit.utilities.getElem('pathpointgrip_container')).find('*').attr('display', 'none');
                        drawn_path = firstCtrl = null;
                        started = false;
                    } else if (current_mode === 'pathedit') {
                        this.toSelectMode();
                    }
                    if (svgedit.path.path) {
                        svgedit.path.path.init().show(false);
                    }
                },
                resetOrientation: function (path) {
                    if (path == null || path.nodeName !== 'path') {
                        return false;
                    }
                    var tlist = svgedit.transformlist.getTransformList(path);
                    var m = svgedit.math.transformListToTransform(tlist).matrix;
                    tlist.clear();
                    path.removeAttribute('transform');
                    var segList = path.pathSegList;

                    // Opera/win/non-EN throws an error here.
                    // TODO: Find out why!
                    // Presumed fixed in Opera 10.5, so commented out for now

                    //			try {
                    var len = segList.numberOfItems;
                    //			} catch(err) {
                    //				var fixed_d = pathActions.convertPath(path);
                    //				path.setAttribute('d', fixed_d);
                    //				segList = path.pathSegList;
                    //				var len = segList.numberOfItems;
                    //			}
                    var i, last_x, last_y;

                    for (i = 0; i < len; ++i) {
                        var seg = segList.getItem(i);
                        var type = seg.pathSegType;
                        if (type == 1) {
                            continue;
                        }
                        var pts = [];
                        $.each(['', 1, 2], function (j, n) {
                            var x = seg['x' + n],
                                y = seg['y' + n];
                            if (x !== undefined && y !== undefined) {
                                var pt = svgedit.math.transformPoint(x, y, m);
                                pts.splice(pts.length, 0, pt.x, pt.y);
                            }
                        });
                        svgedit.path.replacePathSeg(type, i, pts, path);
                    }

                    reorientGrads(path, m);
                },
                zoomChange: function () {
                    if (current_mode === 'pathedit') {
                        svgedit.path.path.update();
                    }
                },
                getNodePoint: function () {
                    var sel_pt = svgedit.path.path.selected_pts.length ? svgedit.path.path.selected_pts[0] : 1;

                    var seg = svgedit.path.path.segs[sel_pt];
                    return {
                        x: seg.item.x,
                        y: seg.item.y,
                        type: seg.type
                    };
                },
                linkControlPoints: function (linkPoints) {
                    svgedit.path.setLinkControlPoints(linkPoints);
                },
                clonePathNode: function () {
                    svgedit.path.path.storeD();

                    var sel_pts = svgedit.path.path.selected_pts;
                    var segs = svgedit.path.path.segs;

                    var i = sel_pts.length;
                    var nums = [];

                    while (i--) {
                        var pt = sel_pts[i];
                        svgedit.path.path.addSeg(pt);

                        nums.push(pt + i);
                        nums.push(pt + i + 1);
                    }
                    svgedit.path.path.init().addPtsToSelection(nums);

                    svgedit.path.path.endChanges('Clone path node(s)');
                },
                opencloseSubPath: function () {
                    var sel_pts = svgedit.path.path.selected_pts;
                    // Only allow one selected node for now
                    if (sel_pts.length !== 1) {
                        return;
                    }

                    var elem = svgedit.path.path.elem;
                    var list = elem.pathSegList;

                    var len = list.numberOfItems;

                    var index = sel_pts[0];

                    var open_pt = null;
                    var start_item = null;

                    // Check if subpath is already open
                    svgedit.path.path.eachSeg(function (i) {
                        if (this.type === 2 && i <= index) {
                            start_item = this.item;
                        }
                        if (i <= index) {
                            return true;
                        }
                        if (this.type === 2) {
                            // Found M first, so open
                            open_pt = i;
                            return false;
                        }
                        if (this.type === 1) {
                            // Found Z first, so closed
                            open_pt = false;
                            return false;
                        }
                    });

                    if (open_pt == null) {
                        // Single path, so close last seg
                        open_pt = svgedit.path.path.segs.length - 1;
                    }

                    if (open_pt !== false) {
                        // Close this path

                        // Create a line going to the previous "M"
                        var newseg = elem.createSVGPathSegLinetoAbs(start_item.x, start_item.y);

                        var closer = elem.createSVGPathSegClosePath();
                        if (open_pt == svgedit.path.path.segs.length - 1) {
                            list.appendItem(newseg);
                            list.appendItem(closer);
                        } else {
                            svgedit.path.insertItemBefore(elem, closer, open_pt);
                            svgedit.path.insertItemBefore(elem, newseg, open_pt);
                        }

                        svgedit.path.path.init().selectPt(open_pt + 1);
                        return;
                    }

                    // M 1,1 L 2,2 L 3,3 L 1,1 z // open at 2,2
                    // M 2,2 L 3,3 L 1,1

                    // M 1,1 L 2,2 L 1,1 z M 4,4 L 5,5 L6,6 L 5,5 z
                    // M 1,1 L 2,2 L 1,1 z [M 4,4] L 5,5 L(M)6,6 L 5,5 z

                    var seg = svgedit.path.path.segs[index];

                    if (seg.mate) {
                        list.removeItem(index); // Removes last "L"
                        list.removeItem(index); // Removes the "Z"
                        svgedit.path.path.init().selectPt(index - 1);
                        return;
                    }

                    var i, last_m, z_seg;

                    // Find this sub-path's closing point and remove
                    for (i = 0; i < list.numberOfItems; i++) {
                        var item = list.getItem(i);

                        if (item.pathSegType === 2) {
                            // Find the preceding M
                            last_m = i;
                        } else if (i === index) {
                            // Remove it
                            list.removeItem(last_m);
                            //						index--;
                        } else if (item.pathSegType === 1 && index < i) {
                            // Remove the closing seg of this subpath
                            z_seg = i - 1;
                            list.removeItem(i);
                            break;
                        }
                    }

                    var num = (index - last_m) - 1;

                    while (num--) {
                        svgedit.path.insertItemBefore(elem, list.getItem(last_m), z_seg);
                    }

                    var pt = list.getItem(last_m);

                    // Make this point the new "M"
                    svgedit.path.replacePathSeg(2, last_m, [pt.x, pt.y]);

                    i = index; // i is local here, so has no effect; what is the reason for this?

                    svgedit.path.path.init().selectPt(0);
                },
                deletePathNode: function () {
                    if (!pathActions.canDeleteNodes) {
                        return;
                    }
                    svgedit.path.path.storeD();

                    var sel_pts = svgedit.path.path.selected_pts;
                    var i = sel_pts.length;

                    while (i--) {
                        var pt = sel_pts[i];
                        svgedit.path.path.deleteSeg(pt);
                    }

                    // Cleanup
                    var cleanup = function () {
                        var segList = svgedit.path.path.elem.pathSegList;
                        var len = segList.numberOfItems;

                        var remItems = function (pos, count) {
                            while (count--) {
                                segList.removeItem(pos);
                            }
                        };

                        if (len <= 1) {
                            return true;
                        }

                        while (len--) {
                            var item = segList.getItem(len);
                            if (item.pathSegType === 1) {
                                var prev = segList.getItem(len - 1);
                                var nprev = segList.getItem(len - 2);
                                if (prev.pathSegType === 2) {
                                    remItems(len - 1, 2);
                                    cleanup();
                                    break;
                                } else if (nprev.pathSegType === 2) {
                                    remItems(len - 2, 3);
                                    cleanup();
                                    break;
                                }

                            } else if (item.pathSegType === 2) {
                                if (len > 0) {
                                    var prev_type = segList.getItem(len - 1).pathSegType;
                                    // Path has M M
                                    if (prev_type === 2) {
                                        remItems(len - 1, 1);
                                        cleanup();
                                        break;
                                        // Entire path ends with Z M
                                    } else if (prev_type === 1 && segList.numberOfItems - 1 === len) {
                                        remItems(len, 1);
                                        cleanup();
                                        break;
                                    }
                                }
                            }
                        }
                        return false;
                    };

                    cleanup();

                    // Completely delete a path with 1 or 0 segments
                    if (svgedit.path.path.elem.pathSegList.numberOfItems <= 1) {
                        pathActions.toSelectMode(svgedit.path.path.elem);
                        canvas.deleteSelectedElements();
                        return;
                    }

                    svgedit.path.path.init();
                    svgedit.path.path.clearSelection();

                    // TODO: Find right way to select point now
                    // path.selectPt(sel_pt);
                    if (window.opera) { // Opera repaints incorrectly
                        var cp = $(svgedit.path.path.elem);
                        cp.attr('d', cp.attr('d'));
                    }
                    svgedit.path.path.endChanges('Delete path node(s)');
                },
                smoothPolylineIntoPath: smoothPolylineIntoPath,
                setSegType: function (v) {
                    svgedit.path.path.setSegType(v);
                },
                moveNode: function (attr, newValue) {
                    var sel_pts = svgedit.path.path.selected_pts;
                    if (!sel_pts.length) {
                        return;
                    }

                    svgedit.path.path.storeD();

                    // Get first selected point
                    var seg = svgedit.path.path.segs[sel_pts[0]];
                    var diff = {
                        x: 0,
                        y: 0
                    };
                    diff[attr] = newValue - seg.item[attr];

                    seg.move(diff.x, diff.y);
                    svgedit.path.path.endChanges('Move path point');
                },
                fixEnd: function (elem) {
                    // Adds an extra segment if the last seg before a Z doesn't end
                    // at its M point
                    // M0,0 L0,100 L100,100 z
                    var segList = elem.pathSegList;
                    var len = segList.numberOfItems;
                    var i, last_m;
                    for (i = 0; i < len; ++i) {
                        var item = segList.getItem(i);
                        if (item.pathSegType === 2) {
                            last_m = item;
                        }

                        if (item.pathSegType === 1) {
                            var prev = segList.getItem(i - 1);
                            if (prev.x != last_m.x || prev.y != last_m.y) {
                                // Add an L segment here
                                var newseg = elem.createSVGPathSegLinetoAbs(last_m.x, last_m.y);
                                svgedit.path.insertItemBefore(elem, newseg, i);
                                // Can this be done better?
                                pathActions.fixEnd(elem);
                                break;
                            }

                        }
                    }
                    if (svgedit.browser.isWebkit()) {
                        resetD(elem);
                    }
                },
                // Convert a path to one with only absolute or relative values
                convertPath: svgedit.utilities.convertPath
            };
        })();
        // end pathActions

        // Group: Serialization

        // Function: removeUnusedDefElems
        // Looks at DOM elements inside the <defs> to see if they are referred to,
        // removes them from the DOM if they are not.
        //
        // Returns:
        // The amount of elements that were removed
        var removeUnusedDefElems = this.removeUnusedDefElems = function () {
            var defs = svgcontent.getElementsByTagNameNS(NS.SVG, 'defs');
            if (!defs || !defs.length) {
                return 0;
            }

            //	if (!defs.firstChild) {return;}

            var defelem_uses = [],
                numRemoved = 0;
            var attrs = ['fill', 'stroke', 'filter', 'marker-start', 'marker-mid', 'marker-end'];
            var alen = attrs.length;

            var all_els = svgcontent.getElementsByTagNameNS(NS.SVG, '*');
            var all_len = all_els.length;

            var i, j;
            for (i = 0; i < all_len; i++) {
                var el = all_els[i];
                for (j = 0; j < alen; j++) {
                    var ref = svgedit.utilities.getUrlFromAttr(el.getAttribute(attrs[j]));
                    if (ref) {
                        defelem_uses.push(ref.substr(1));
                    }
                }

                // gradients can refer to other gradients
                var href = getHref(el);
                if (href && href.indexOf('#') === 0) {
                    defelem_uses.push(href.substr(1));
                }
            }

            const isDefUsed = node => {
                const id = node.id;
                if (id && defelem_uses.includes(id)) {
                    return true;
                }
                return false;
            };

            // remove if both itself and all its children are unused.
            const removeUnusedDef = node => {
                let shouldIStay = false;
                const children = node.childNodes;

                if (isDefUsed(node)) {
                    shouldIStay = true;
                } else if (children.length > 0) {
                    shouldIStay = Array.from(children)
                        .map(child => removeUnusedDef(child))
                        .reduce((acc, cur) => (acc && cur));
                }

                if (shouldIStay) {
                    return true;
                } else {
                    // Good bye node
                    removedElements[node.id] = node;
                    node.parentNode.removeChild(node);
                    numRemoved++;

                    return false;
                }
            };
            $(defs)
                .children('linearGradient, radialGradient, filter, marker, svg, symbol')
                .toArray()
                .map(def => removeUnusedDef(def));

            return numRemoved;
        };

        // Function: svgCanvasToString
        // Main function to set up the SVG content for output
        //
        // Returns:
        // String containing the SVG image for output
        this.svgCanvasToString = function () {
            // keep calling it until there are none to remove
            while (removeUnusedDefElems() > 0) {}
            pathActions.clear(true);

            // Keep SVG-Edit comment on top
            $.each(svgcontent.childNodes, function (i, node) {
                if (i && node.nodeType === 8 && node.data.indexOf('Created with') >= 0) {
                    svgcontent.insertBefore(node, svgcontent.firstChild);
                }
            });

            // Move out of in-group editing mode
            if (current_group) {
                leaveContext();
                selectOnly([current_group]);
            }

            var naked_svgs = [];

            // Unwrap gsvg if it has no special attributes (only id and style)
            $(svgcontent).find('g:data(gsvg)').each(function () {
                var attrs = this.attributes;
                var len = attrs.length;
                var i;
                for (i = 0; i < len; i++) {
                    if (attrs[i].nodeName === 'id' || attrs[i].nodeName === 'style') {
                        len--;
                    }
                }
                // No significant attributes, so ungroup
                if (len <= 0) {
                    var svg = this.firstChild;
                    naked_svgs.push(svg);
                    $(this).replaceWith(svg);
                }
            });
            engraveDpi= BeamboxPreference.read('engrave_dpi');
            rotaryMode= BeamboxPreference.read('rotary_mode');
            svgcontent.setAttribute('data-engrave_dpi', engraveDpi);
            svgcontent.setAttribute('data-rotary_mode', rotaryMode);
            const x = $('#workarea').scrollLeft() / current_zoom - Constant.dimension.width;
            const y = $('#workarea').scrollTop() / current_zoom - Constant.dimension.height;
            svgcontent.setAttribute('data-zoom', (Math.round(current_zoom * 1000) / 1000));
            svgcontent.setAttribute('data-left', Math.round(x));
            svgcontent.setAttribute('data-top', Math.round(y));
            var output = this.svgToString(svgcontent, 0);
            
            // Rewrap gsvg
            if (naked_svgs.length) {
                $(naked_svgs).each(function () {
                    groupSvgElem(this);
                });
            }

            console.log(output);

            return output;
        };

        // Function: svgToString
        // Sub function ran on each SVG element to convert it to a string as desired
        //
        // Parameters:
        // elem - The SVG element to convert
        // indent - Integer with the amount of spaces to indent this tag
        //
        // Returns:
        // String with the given element as an SVG tag
        this.svgToString = function (elem, indent) {
            var out = [],
                toXml = svgedit.utilities.toXml;
            var unit = curConfig.baseUnit;
            var unit_re = new RegExp('^-?[\\d\\.]+' + unit + '$');

            if (elem) {
                cleanupElement(elem);
                var attrs = elem.attributes,
                    attr,
                    i,
                    childs = elem.childNodes;

                for (i = 0; i < indent; i++) {
                    out.push(' ');
                }
                out.push('<');
                out.push(elem.nodeName);
                if (elem.id === 'svgcontent') {
                    // Process root element separately
                    var res = getResolution();

                    var vb = '';
                    // TODO: Allow this by dividing all values by current baseVal
                    // Note that this also means we should properly deal with this on import
                    //			if (curConfig.baseUnit !== 'px') {
                    //				var unit = curConfig.baseUnit;
                    //				var unit_m = svgedit.units.getTypeMap()[unit];
                    //				res.w = svgedit.units.shortFloat(res.w / unit_m)
                    //				res.h = svgedit.units.shortFloat(res.h / unit_m)
                    //				vb = ' viewBox="' + [0, 0, res.w, res.h].join(' ') + '"';
                    //				res.w += unit;
                    //				res.h += unit;
                    //			}

                    if (unit !== 'px') {
                        res.w = svgedit.units.convertUnit(res.w, unit) + unit;
                        res.h = svgedit.units.convertUnit(res.h, unit) + unit;
                    }

                    out.push(' id="svgcontent" width="' + res.w + '" height="' + res.h + '"' + vb + ' xmlns="' + NS.SVG + '"');

                    var nsuris = {};

                    // Check elements for namespaces, add if found
                    $(elem).find('*').andSelf().each(function () {
                        var el = this;
                        // for some elements have no attribute
                        var uri = this.namespaceURI;
                        if (uri && !nsuris[uri] && nsMap[uri] && nsMap[uri] !== 'xmlns' && nsMap[uri] !== 'xml') {
                            nsuris[uri] = true;
                            out.push(' xmlns:' + nsMap[uri] + '="' + uri + '"');
                        }

                        $.each(this.attributes, function (i, attr) {
                            var uri = attr.namespaceURI;
                            if (uri && !nsuris[uri] && nsMap[uri] !== 'xmlns' && nsMap[uri] !== 'xml') {
                                nsuris[uri] = true;
                                out.push(' xmlns:' + nsMap[uri] + '="' + uri + '"');
                            }
                        });
                    });

                    i = attrs.length;
                    var attr_names = ['width', 'height', 'xmlns', 'x', 'y', 'viewBox', 'id', 'overflow'];
                    while (i--) {
                        attr = attrs.item(i);
                        var attrVal = toXml(attr.value);

                        // Namespaces have already been dealt with, so skip
                        if (attr.nodeName.indexOf('xmlns:') === 0) {
                            continue;
                        }

                        // only serialize attributes we don't use internally
                        if (attrVal != '' && attr_names.indexOf(attr.localName) === -1) {

                            if (!attr.namespaceURI || nsMap[attr.namespaceURI]) {
                                out.push(' ');
                                out.push(attr.nodeName);
                                out.push('="');
                                out.push(attrVal);
                                out.push('"');
                            }
                        }
                    }
                } else {
                    // Skip empty defs
                    if (elem.nodeName === 'defs' && !elem.firstChild) {
                        return;
                    }

                    var moz_attrs = ['-moz-math-font-style', '_moz-math-font-style'];
                    for (i = attrs.length - 1; i >= 0; i--) {
                        attr = attrs.item(i);
                        var attrVal = toXml(attr.value);
                        //remove bogus attributes added by Gecko
                        if (moz_attrs.indexOf(attr.localName) >= 0) {
                            continue;
                        }
                        if (attrVal != '') {
                            if (attrVal.indexOf('pointer-events') === 0) {
                                continue;
                            }
                            if (attr.localName === 'class' && attrVal.indexOf('se_') === 0) {
                                continue;
                            }
                            out.push(' ');
                            if (attr.localName === 'd') {
                                attrVal = pathActions.convertPath(elem, true);
                            }
                            if (!isNaN(attrVal)) {
                                attrVal = svgedit.units.shortFloat(attrVal);
                            } else if (unit_re.test(attrVal)) {
                                attrVal = svgedit.units.shortFloat(attrVal) + unit;
                            }

                            // Embed images when saving
                            if (save_options.apply &&
                                elem.nodeName === 'image' &&
                                attr.localName === 'href' &&
                                save_options.images &&
                                save_options.images === 'embed') {
                                var img = encodableImages[attrVal];
                                if (img) {
                                    attrVal = img;
                                }
                            }

                            // map various namespaces to our fixed namespace prefixes
                            // (the default xmlns attribute itself does not get a prefix)
                            if (!attr.namespaceURI || attr.namespaceURI === NS.SVG || nsMap[attr.namespaceURI]) {
                                out.push(attr.nodeName);
                                out.push('="');
                                out.push(attrVal);
                                out.push('"');
                            }
                        }
                    }
                }

                if (elem.hasChildNodes()) {
                    out.push('>');
                    indent++;
                    var bOneLine = false;

                    for (i = 0; i < childs.length; i++) {
                        var child = childs.item(i);
                        switch (child.nodeType) {
                            case 1: // element node
                                out.push('\n');
                                out.push(this.svgToString(childs.item(i), indent));
                                break;
                            case 3: // text node
                                var str = child.nodeValue.replace(/^\s+|\s+$/g, '');
                                if (str != '') {
                                    bOneLine = true;
                                    out.push(String(toXml(str)));
                                }
                                break;
                            case 4: // cdata node
                                out.push('\n');
                                out.push(new Array(indent + 1).join(' '));
                                out.push('<![CDATA[');
                                out.push(child.nodeValue);
                                out.push(']]>');
                                break;
                            case 8: // comment
                                out.push('\n');
                                out.push(new Array(indent + 1).join(' '));
                                out.push('<!--');
                                out.push(child.data);
                                out.push('-->');
                                break;
                        } // switch on node type
                    }
                    indent--;
                    if (!bOneLine) {
                        out.push('\n');
                        for (i = 0; i < indent; i++) {
                            out.push(' ');
                        }
                    }
                    out.push('</');
                    out.push(elem.nodeName);
                    out.push('>');
                } else {
                    out.push('/>');
                }
            }
            return out.join('');
        }; // end svgToString()

        // Function: embedImage
        // Converts a given image file to a data URL when possible, then runs a given callback
        //
        // Parameters:
        // val - String with the path/URL of the image
        // callback - Optional function to run when image data is found, supplies the
        // result (data URL or false) as first parameter.
        this.embedImage = function (val, callback) {
            // load in the image and once it's loaded, get the dimensions
            $(new Image()).load(function () {
                // create a canvas the same size as the raster image
                var canvas = document.createElement('canvas');
                canvas.width = this.width;
                canvas.height = this.height;
                // load the raster image into the canvas
                canvas.getContext('2d').drawImage(this, 0, 0);
                // retrieve the data: URL
                try {
                    var urldata = ';svgedit_url=' + encodeURIComponent(val);
                    urldata = canvas.toDataURL().replace(';base64', urldata + ';base64');
                    encodableImages[val] = urldata;
                } catch (e) {
                    encodableImages[val] = false;
                }
                last_good_img_url = val;
                if (callback) {
                    callback(encodableImages[val]);
                }
            }).attr('src', val);
        };

        // Function: setGoodImage
        // Sets a given URL to be a "last good image" URL
        this.setGoodImage = function (val) {
            last_good_img_url = val;
        };

        this.open = function () {
            // Nothing by default, handled by optional widget/extension
        };

        // Function: save
        // Serializes the current drawing into SVG XML text and returns it to the 'saved' handler.
        // This function also includes the XML prolog. Clients of the SvgCanvas bind their save
        // function to the 'saved' event.
        //
        // Returns:
        // Nothing
        this.save = function (opts) {
            // remove the selected outline before serializing
            clearSelection();
            // Update save options if provided
            if (opts) {
                $.extend(save_options, opts);
            }
            save_options.apply = true;

            // no need for doctype, see http://jwatt.org/svg/authoring/#doctype-declaration
            var str = this.svgCanvasToString();
            call('saved', str);
        };

        function getIssues() {
            // remove the selected outline before serializing
            clearSelection();

            // Check for known CanVG issues
            var issues = [];

            // Selector and notice
            var issue_list = {
                'feGaussianBlur': uiStrings.exportNoBlur,
                'foreignObject': uiStrings.exportNoforeignObject,
                '[stroke-dasharray]': uiStrings.exportNoDashArray
            };
            var content = $(svgcontent);

            // Add font/text check if Canvas Text API is not implemented
            if (!('font' in $('<canvas>')[0].getContext('2d'))) {
                issue_list.text = uiStrings.exportNoText;
            }

            $.each(issue_list, function (sel, descr) {
                if (content.find(sel).length) {
                    issues.push(descr);
                }
            });
            return issues;
        }

        // Function: rasterExport
        // Generates a Data URL based on the current image, then calls "exported"
        // with an object including the string, image information, and any issues found
        this.rasterExport = function (imgType, quality, exportWindowName) {
            var mimeType = 'image/' + imgType.toLowerCase();
            var issues = getIssues();
            var str = this.svgCanvasToString();

            svgedit.utilities.buildCanvgCallback(function () {
                var type = imgType || 'PNG';
                if (!$('#export_canvas').length) {
                    $('<canvas>', {
                        id: 'export_canvas'
                    }).hide().appendTo('body');
                }
                var c = $('#export_canvas')[0];
                c.width = svgCanvas.contentW;
                c.height = svgCanvas.contentH;

                canvg(c, str, {
                    renderCallback: function () {
                        var dataURLType = (type === 'ICO' ? 'BMP' : type).toLowerCase();
                        var datauri = quality ? c.toDataURL('image/' + dataURLType, quality) : c.toDataURL('image/' + dataURLType);

                        call('exported', {
                            datauri: datauri,
                            svg: str,
                            issues: issues,
                            type: imgType,
                            mimeType: mimeType,
                            quality: quality,
                            exportWindowName: exportWindowName
                        });
                    }
                });
            })();
        };

        this.exportPDF = function (exportWindowName, outputType) {
            var that = this;
            svgedit.utilities.buildJSPDFCallback(function () {
                var res = getResolution();
                var orientation = res.w > res.h ? 'landscape' : 'portrait';
                var units = 'pt'; // curConfig.baseUnit; // We could use baseUnit, but that is presumably not intended for export purposes
                var doc = jsPDF({
                    orientation: orientation,
                    unit: units,
                    format: [res.w, res.h]
                    // , compressPdf: true
                }); // Todo: Give options to use predefined jsPDF formats like "a4", etc. from pull-down (with option to keep customizable)
                var docTitle = getDocumentTitle();
                doc.setProperties({
                    title: docTitle
                    /*,
                    			subject: '',
                    			author: '',
                    			keywords: '',
                    			creator: ''*/
                });
                var issues = getIssues();
                var str = that.svgCanvasToString();
                doc.addSVG(str, 0, 0);

                // doc.output('save'); // Works to open in a new
                //  window; todo: configure this and other export
                //  options to optionally work in this manner as
                //  opposed to opening a new tab
                var obj = {
                    svg: str,
                    issues: issues,
                    exportWindowName: exportWindowName
                };
                var method = outputType || 'dataurlstring';
                obj[method] = doc.output(method);
                call('exportedPDF', obj);
            })();
        };

        // Function: getSvgString
        // Returns the current drawing as raw SVG XML text.
        //
        // Returns:
        // The current drawing as raw SVG XML text.
        this.getSvgString = function () {
            if (tempGroup) {
                this.ungroupTempGroup();
            }
            save_options.apply = false;
            return this.svgCanvasToString();
        };

        // Function: randomizeIds
        // This function determines whether to use a nonce in the prefix, when
        // generating IDs for future documents in SVG-Edit.
        //
        // Parameters:
        // an optional boolean, which, if true, adds a nonce to the prefix. Thus
        // svgCanvas.randomizeIds() <==> svgCanvas.randomizeIds(true)
        //
        // if you're controlling SVG-Edit externally, and want randomized IDs, call
        // this BEFORE calling svgCanvas.setSvgString
        //
        this.randomizeIds = function (enableRandomization) {
            if (arguments.length > 0 && enableRandomization == false) {
                svgedit.draw.randomizeIds(false, getCurrentDrawing());
            } else {
                svgedit.draw.randomizeIds(true, getCurrentDrawing());
            }
        };

        // Function: uniquifyElems
        // Ensure each element has a unique ID
        //
        // Parameters:
        // g - The parent element of the tree to give unique IDs
        var uniquifyElems = this.uniquifyElems = function (g) {
            var ids = {};
            // TODO: Handle markers and connectors. These are not yet re-identified properly
            // as their referring elements do not get remapped.
            //
            // <marker id='se_marker_end_svg_7'/>
            // <polyline id='svg_7' se:connector='svg_1 svg_6' marker-end='url(#se_marker_end_svg_7)'/>
            //
            // Problem #1: if svg_1 gets renamed, we do not update the polyline's se:connector attribute
            // Problem #2: if the polyline svg_7 gets renamed, we do not update the marker id nor the polyline's marker-end attribute
            var ref_elems = ['filter', 'linearGradient', 'pattern', 'radialGradient', 'symbol', 'textPath', 'use'];

            svgedit.utilities.walkTree(g, function (n) {
                // if it's an element node
                if (n.nodeType == 1) {
                    // and the element has an ID
                    if (n.id) {
                        // and we haven't tracked this ID yet
                        if (!(n.id in ids)) {
                            // add this id to our map
                            ids[n.id] = {
                                elem: null,
                                attrs: [],
                                hrefs: []
                            };
                        }
                        ids[n.id].elem = n;
                    }

                    // now search for all attributes on this element that might refer
                    // to other elements
                    $.each(ref_attrs, function (i, attr) {
                        var attrnode = n.getAttributeNode(attr);
                        if (attrnode) {
                            // the incoming file has been sanitized, so we should be able to safely just strip off the leading #
                            var url = svgedit.utilities.getUrlFromAttr(attrnode.value),
                                refid = url ? url.substr(1) : null;
                            if (refid) {
                                if (!(refid in ids)) {
                                    // add this id to our map
                                    ids[refid] = {
                                        elem: null,
                                        attrs: [],
                                        hrefs: []
                                    };
                                }
                                ids[refid].attrs.push(attrnode);
                            }
                        }
                    });

                    // check xlink:href now
                    var href = svgedit.utilities.getHref(n);
                    // TODO: what if an <image> or <a> element refers to an element internally?
                    if (href && ref_elems.indexOf(n.nodeName) >= 0) {
                        var refid = href.substr(1);
                        if (refid) {
                            if (!(refid in ids)) {
                                // add this id to our map
                                ids[refid] = {
                                    elem: null,
                                    attrs: [],
                                    hrefs: []
                                };
                            }
                            ids[refid].hrefs.push(n);
                        }
                    }
                }
            });

            // in ids, we now have a map of ids, elements and attributes, let's re-identify
            var oldid;
            for (oldid in ids) {
                break;
                if (!oldid) {
                    continue;
                }
                var elem = ids[oldid].elem;
                if (elem) {
                    var newid = getNextId();

                    // assign element its new id
                    elem.id = newid;

                    // remap all url() attributes
                    var attrs = ids[oldid].attrs;
                    var j = attrs.length;
                    while (j--) {
                        var attr = attrs[j];
                        attr.ownerElement.setAttribute(attr.name, 'url(#' + newid + ')');
                    }

                    // remap all href attributes
                    var hreffers = ids[oldid].hrefs;
                    var k = hreffers.length;
                    while (k--) {
                        var hreffer = hreffers[k];
                        svgedit.utilities.setHref(hreffer, '#' + newid);
                    }
                }
            }
        };

        // Function setUseData
        // Assigns reference data for each use element
        var setUseData = this.setUseData = function (parent) {
            var elems = $(parent);

            if (parent.tagName !== 'use') {
                elems = elems.find('use');
            }

            elems.each(function () {
                var id = getHref(this).substr(1);
                var ref_elem = svgedit.utilities.getElem(id);
                if (!ref_elem) {
                    return;
                }
                $(this).data('ref', ref_elem);
                if (ref_elem.tagName === 'symbol' || ref_elem.tagName === 'svg') {
                    $(this).data('symbol', ref_elem).data('ref', ref_elem);
                }
            });
        };

        // Function convertGradients
        // Converts gradients from userSpaceOnUse to objectBoundingBox
        var convertGradients = this.convertGradients = function (elem) {
            var elems = $(elem).find('linearGradient, radialGradient');
            if (!elems.length && svgedit.browser.isWebkit()) {
                // Bug in webkit prevents regular *Gradient selector search
                elems = $(elem).find('*').filter(function () {
                    return (this.tagName.indexOf('Gradient') >= 0);
                });
            }

            elems.each(function () {
                var grad = this;
                if ($(grad).attr('gradientUnits') === 'userSpaceOnUse') {
                    // TODO: Support more than one element with this ref by duplicating parent grad
                    var elems = $(svgcontent).find('[fill="url(#' + grad.id + ')"],[stroke="url(#' + grad.id + ')"]');
                    if (!elems.length) {
                        return;
                    }

                    // get object's bounding box
                    var bb = svgedit.utilities.getBBox(elems[0]);

                    // This will occur if the element is inside a <defs> or a <symbol>,
                    // in which we shouldn't need to convert anyway.
                    if (!bb) {
                        return;
                    }

                    if (grad.tagName === 'linearGradient') {
                        var g_coords = $(grad).attr(['x1', 'y1', 'x2', 'y2']);

                        // If has transform, convert
                        var tlist = grad.gradientTransform.baseVal;
                        if (tlist && tlist.numberOfItems > 0) {
                            var m = svgedit.math.transformListToTransform(tlist).matrix;
                            var pt1 = svgedit.math.transformPoint(g_coords.x1, g_coords.y1, m);
                            var pt2 = svgedit.math.transformPoint(g_coords.x2, g_coords.y2, m);

                            g_coords.x1 = pt1.x;
                            g_coords.y1 = pt1.y;
                            g_coords.x2 = pt2.x;
                            g_coords.y2 = pt2.y;
                            grad.removeAttribute('gradientTransform');
                        }

                        $(grad).attr({
                            x1: (g_coords.x1 - bb.x) / bb.width,
                            y1: (g_coords.y1 - bb.y) / bb.height,
                            x2: (g_coords.x2 - bb.x) / bb.width,
                            y2: (g_coords.y2 - bb.y) / bb.height
                        });
                        grad.removeAttribute('gradientUnits');
                    }
                    // else {
                    // Note: radialGradient elements cannot be easily converted
                    // because userSpaceOnUse will keep circular gradients, while
                    // objectBoundingBox will x/y scale the gradient according to
                    // its bbox.

                    // For now we'll do nothing, though we should probably have
                    // the gradient be updated as the element is moved, as
                    // inkscape/illustrator do.

                    //						var g_coords = $(grad).attr(['cx', 'cy', 'r']);
                    //
                    //						$(grad).attr({
                    //							cx: (g_coords.cx - bb.x) / bb.width,
                    //							cy: (g_coords.cy - bb.y) / bb.height,
                    //							r: g_coords.r
                    //						});
                    //
                    //						grad.removeAttribute('gradientUnits');
                    // }
                }
            });
        };

        // Function: convertToGroup
        // Converts selected/given <use> or child SVG element to a group
        var convertToGroup = this.convertToGroup = function (elem) {
            if (!elem) {
                elem = selectedElements[0];
            }
            var $elem = $(elem);
            var batchCmd = new svgedit.history.BatchCommand();
            var ts;

            if ($elem.data('gsvg')) {
                // Use the gsvg as the new group
                var svg = elem.firstChild;
                var pt = $(svg).attr(['x', 'y']);

                $(elem.firstChild.firstChild).unwrap();
                $(elem).removeData('gsvg');

                var tlist = svgedit.transformlist.getTransformList(elem);
                var xform = svgroot.createSVGTransform();
                xform.setTranslate(pt.x, pt.y);
                tlist.appendItem(xform);
                svgedit.recalculate.recalculateDimensions(elem);
                call('selected', [elem]);
            } else if ($elem.data('symbol')) {
                elem = $elem.data('symbol');

                ts = $elem.attr('transform');
                var pos = $elem.attr(['x', 'y']);

                var vb = elem.getAttribute('viewBox');

                if (vb) {
                    var nums = vb.split(' ');
                    pos.x -= +nums[0];
                    pos.y -= +nums[1];
                }

                // Not ideal, but works
                ts += ' translate(' + (pos.x || 0) + ',' + (pos.y || 0) + ')';

                var prev = $elem.prev();

                // Remove <use> element
                batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand($elem[0], $elem[0].nextSibling, $elem[0].parentNode));
                $elem.remove();

                // See if other elements reference this symbol
                var has_more = $(svgcontent).find('use:data(symbol)').length;

                var g = svgdoc.createElementNS(NS.SVG, 'g');
                var childs = elem.childNodes;

                var i;
                for (i = 0; i < childs.length; i++) {
                    g.appendChild(childs[i].cloneNode(true));
                }

                // Duplicate the gradients for Gecko, since they weren't included in the <symbol>
                if (svgedit.browser.isGecko()) {
                    var dupeGrads = $(svgedit.utilities.findDefs()).children('linearGradient,radialGradient,pattern').clone();
                    $(g).append(dupeGrads);
                }

                if (ts) {
                    g.setAttribute('transform', ts);
                }

                var parent = elem.parentNode;

                uniquifyElems(g);

                // Put the dupe gradients back into <defs> (after uniquifying them)
                if (svgedit.browser.isGecko()) {
                    $(findDefs()).append($(g).find('linearGradient,radialGradient,pattern'));
                }

                // now give the g itself a new id
                g.id = getNextId();

                prev.after(g);

                if (parent) {
                    if (!has_more) {
                        // remove symbol/svg element
                        var nextSibling = elem.nextSibling;
                        parent.removeChild(elem);
                        batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(elem, nextSibling, parent));
                    }
                    batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));
                }

                setUseData(g);

                if (svgedit.browser.isGecko()) {
                    convertGradients(svgedit.utilities.findDefs());
                } else {
                    convertGradients(g);
                }

                // recalculate dimensions on the top-level children so that unnecessary transforms
                // are removed
                svgedit.utilities.walkTreePost(g, function (n) {
                    try {
                        svgedit.recalculate.recalculateDimensions(n);
                    } catch (e) {
                        console.log(e);
                    }
                });

                // Give ID for any visible element missing one
                $(g).find(visElems).each(function () {
                    if (!this.id) {
                        this.id = getNextId();
                    }
                });

                selectOnly([g]);

                var cm = pushGroupProperties(g, true);
                if (cm) {
                    batchCmd.addSubCommand(cm);
                }

                addCommandToHistory(batchCmd);

            } else {
                console.log('Unexpected element to ungroup:', elem);
            }
        };

        //
        // Function: setSvgString
        // This function sets the current drawing as the input SVG XML.
        //
        // Parameters:
        // xmlString - The SVG as XML text.
        //
        // Returns:
        // This function returns false if the set was unsuccessful, true otherwise.
        this.setSvgString = function (xmlString) {
            try {
                // convert string into XML document
                var newDoc = svgedit.utilities.text2xml(xmlString);

                this.prepareSvg(newDoc);

                var batchCmd = new svgedit.history.BatchCommand('Change Source');

                // remove old svg document
                var nextSibling = svgcontent.nextSibling;
                var oldzoom = svgroot.removeChild(svgcontent);
                batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(oldzoom, nextSibling, svgroot));

                // set new svg document
                // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
                if (svgdoc.adoptNode) {
                    svgcontent = svgdoc.adoptNode(newDoc.documentElement);
                } else {
                    svgcontent = svgdoc.importNode(newDoc.documentElement, true);
                }

                svgroot.appendChild(svgcontent);
                var content = $(svgcontent);

                canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent, idprefix);

                // retrieve or set the nonce
                var nonce = getCurrentDrawing().getNonce();
                if (nonce) {
                    call('setnonce', nonce);
                } else {
                    call('unsetnonce');
                }

                // change image href vals if possible
                content.find('image').each(function () {
                    var image = this;
                    svgedit.utilities.preventClickDefault(image);
                    var val = getHref(this);
                    if (val) {
                        if (val.indexOf('data:') === 0) {
                            // Check if an SVG-edit data URI
                            var m = val.match(/svgedit_url=(.*?);/);
                            if (m) {
                                var url = decodeURIComponent(m[1]);
                                $(new Image()).load(function () {
                                    image.setAttributeNS(NS.XLINK, 'xlink:href', url);
                                }).attr('src', url);
                            }
                        }
                        // Add to encodableImages if it loads
                        canvas.embedImage(val);
                    }
                });

                // Wrap child SVGs in group elements
                content.find('svg').each(function () {
                    // Skip if it's in a <defs>
                    if ($(this).closest('defs').length) {
                        return;
                    }

                    uniquifyElems(this);

                    // Check if it already has a gsvg group
                    var pa = this.parentNode;
                    if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
                        $(pa).data('gsvg', this);
                        pa.id = pa.id || getNextId();
                    } else {
                        groupSvgElem(this);
                    }
                });

                // For Firefox: Put all paint elems in defs
                if (svgedit.browser.isGecko()) {
                    content.find('linearGradient, radialGradient, pattern').appendTo(svgedit.utilities.findDefs());
                }

                // Set ref element for <use> elements

                // TODO: This should also be done if the object is re-added through "redo"
                setUseData(content);

                convertGradients(content[0]);

                var attrs = {
                    id: 'svgcontent',
                    overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden'
                };

                var percs = false;

                // determine proper size
                if (content.attr('viewBox')) {
                    var vb = content.attr('viewBox').split(' ');
                    attrs.width = vb[2];
                    attrs.height = vb[3];
                }
                // handle content that doesn't have a viewBox
                else {
                    $.each(['width', 'height'], function (i, dim) {
                        // Set to 100 if not given
                        var val = content.attr(dim);

                        if (!val) {
                            val = '100%';
                        }

                        if (String(val).substr(-1) === '%') {
                            // Use user units if percentage given
                            percs = true;
                        } else {
                            attrs[dim] = svgedit.units.convertToNum(dim, val);
                        }
                    });
                }

                // Percentage width/height, so let's base it on visible elements
                if (percs) {
                    var bb = getStrokedBBox();
                    attrs.width = bb.width + bb.x;
                    attrs.height = bb.height + bb.y;
                }

                // Just in case negative numbers are given or
                // result from the percs calculation
                if (attrs.width <= 0) {
                    attrs.width = 100;
                }
                if (attrs.height <= 0) {
                    attrs.height = 100;
                }

                // Keep workarea size after loading external svg
                attrs.width = svgEditor.dimensions[0];
                attrs.height = svgEditor.dimensions[1];

                // identify layers
                identifyLayers();

                // Give ID for any visible layer children missing one
                content.children().find(visElems).each(function () {
                    if (!this.id) {
                        this.id = getNextId();
                    }
                });

                content.attr(attrs);
                this.contentW = attrs.width;
                this.contentH = attrs.height;

                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(svgcontent));
                // update root to the correct size
                var changes = content.attr(['width', 'height']);
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgroot, changes));

                // reset zoom
                current_zoom = 1;

                // reset transform lists
                svgedit.transformlist.resetListMap();
                clearSelection();
                svgedit.path.clearData();
                svgroot.appendChild(selectorManager.selectorParentGroup);

                addCommandToHistory(batchCmd);
                call('changed', [svgcontent]);
                const layers = $('#svgcontent > g.layer').toArray();
                layers.forEach(layer => {
                    this.updateLayerColor(layer);
                });
            } catch (e) {
                console.log(e);
                return false;
            }

            return true;
        };

        // Function: importSvgString
        // This function imports the input SVG XML as a <symbol> in the <defs>, then adds a
        // <use> to the current layer.
        //
        // Parameters:
        // xmlString - The SVG as XML text.
        //
        // Returns:
        // This function returns null if the import was unsuccessful, or the element otherwise.
        // TODO:
        // * properly handle if namespace is introduced by imported content (must add to svgcontent
        // and update all prefixes in the imported node)
        // * properly handle recalculating dimensions, recalculateDimensions() doesn't handle
        // arbitrary transform lists, but makes some assumptions about how the transform list
        // was obtained
        // * import should happen in top-left of current zoomed viewport
        this.importSvgString = function (xmlString, _type, layerName) {
            const batchCmd = new svgedit.history.BatchCommand('Import Image');

            function parseSvg(svg, type) {
                function _removeSvgText() {
                    if($(svg).find('text').length) {
                        AlertActions.showPopupInfo('', LANG.popup.no_support_text);
                        $(svg).find('text').remove();
                    }
                }
                function _removeComments() {
                    // only remove comment which level is svg.children.
                    // should traverse all svg level and remove all comments if you have time
                    $(svg).contents().each(function() {
                        if(this.nodeType === Node.COMMENT_NODE) {
                            $(this).remove();
                        }
                    });
                }
                function _symbolWrapper(symbolContents) {
                    const rootViewBox = svg.getAttribute('viewBox');
                    const rootWidth = unit2Pixel(svg.getAttribute('width'));
                    const rootHeight = unit2Pixel(svg.getAttribute('height'));
                    const rootTransform = svg.getAttribute('transform') || '';

                    const transformList = [];
                    transformList.unshift(rootTransform);

                    if (rootWidth && rootHeight && rootViewBox) {
                        console.log('resize with width height viewbox');

                        const resizeW = rootWidth / rootViewBox.split(' ')[2];
                        const resizeH = rootHeight / rootViewBox.split(' ')[3];
                        transformList.unshift(`scale(${resizeW}, ${resizeH})`);
                    } else {
                        // console.log('resize with 72 dpi');

                        const svgUnitScaling = unit2Pixel('1px');
                        transformList.unshift(`scale(${svgUnitScaling})`);
                    }

                    const wrappedSymbolContent = svgdoc.createElementNS(NS.SVG, 'g');
                    if (symbolContents.length) {
                        symbolContents.map(content => {
                            wrappedSymbolContent.appendChild(content);
                        });
                    } else {
                        try {
                            wrappedSymbolContent.appendChild(symbolContents);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    wrappedSymbolContent.setAttribute('viewBox', rootViewBox);
                    wrappedSymbolContent.setAttribute('transform', transformList.join(' '));

                    return wrappedSymbolContent;
                }
                function _parseSvgByLayer() {
                    const defNodes = Array.from(svg.childNodes).filter(node => 'defs' === node.tagName);
                    let defChildren = [];
                    defNodes.map(def => {
                        defChildren = defChildren.concat(Array.from(def.childNodes));
                    });

                    const layerNodes = Array.from(svg.childNodes).filter(node => !['defs', 'title', 'style', 'metadata', 'sodipodi:namedview'].includes(node.tagName));

                    const isValidLayeredSvg = layerNodes.every(node => {
                        // if svg draw some object at first level, return false
                        if(['a', 'circle', 'clipPath', 'ellipse', 'feGaussianBlur', 'foreignObject', 'image', 'line', 'linearGradient', 'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'stop', 'svg', 'switch', 'symbol', 'text', 'textPath', 'tspan', 'use'].includes(node.tagName)) {
                            return false;
                        }

                        // if it is a group, it need to have an id to ensure it is a layer
                        if (node.tagName === 'g' && node.id === null) {
                            return false;
                        }

                        // svg software like inkscape may add additioal tag like "sodipodi:namedview", so we return true as default
                        return true;
                    });
                    if(!isValidLayeredSvg) {
                        return false;
                    }

                    const symbols = layerNodes.map(node => {
                        const symbol = svgCanvas.makeSymbol(_symbolWrapper(node), [], batchCmd, defChildren);
                        return symbol;
                    });

                    return symbols;
                }
                function _parseSvgByColor() {
                    function getColorOfElement(node) {
                        let color;
                        color = node.getAttribute('stroke');
                        if (color === 'none') {
                            color = node.getAttribute('fill');
                        }
                        color = color || 'rgb(0%,0%,0%)';
                        return color;

                    }
                    function getAllColorInNodes(nodes) {
                        const allColorsInNodes = new Set();

                        function traverseToGetAllColor(frontierNode) {
                            Array.from(frontierNode.childNodes).map(child => {
                                if (['polygon', 'path', 'line', 'rect', 'ellipse', 'circle'].includes(child.tagName)) {
                                    allColorsInNodes.add(getColorOfElement(child));
                                } else if ('g' === child.tagName) {
                                    traverseToGetAllColor(child);
                                }
                            });
                        }

                        nodes.map(node => traverseToGetAllColor(node));

                        return allColorsInNodes;
                    }

                    function filterColor(filter, node) {
                        const children = Array.from(node.childNodes);
                        children.map((grandchild) => {
                            if (['polygon', 'path', 'line', 'rect', 'ellipse', 'circle'].indexOf(grandchild.tagName) >=0 ) {
                                var color = getColorOfElement(grandchild);
                                if (color !== filter) {
                                    node.removeChild(grandchild);
                                } else {
                                    node.setAttribute('data-color', color);
                                }
                            } else if (grandchild.tagName === 'g') {
                                grandchild.setAttribute('data-color', color);
                                filterColor(filter, grandchild);
                            }
                        });
                    }

                    const defNodes = Array.from(svg.childNodes).filter(node => 'defs' === node.tagName);
                    let defChildren = [];
                    defNodes.map(def => {
                        defChildren = defChildren.concat(Array.from(def.childNodes));
                    });

                    const originLayerNodes = Array.from(svg.childNodes).filter(child => child.tagName === 'g');

                    const availableColors = getAllColorInNodes(originLayerNodes);

                    // re-classify elements by their color
                    const groupColorMap = {};
                    originLayerNodes.map(child => {
                        Array.from(availableColors).map(strokeColor => {
                            const clonedGroup = child.cloneNode(true);
                            filterColor(strokeColor, clonedGroup);
                            if (!groupColorMap[strokeColor]) {
                                groupColorMap[strokeColor] = svgdoc.createElementNS(NS.SVG, 'g');
                                groupColorMap[strokeColor].setAttribute('data-color', strokeColor);
                            }
                            groupColorMap[strokeColor].appendChild(clonedGroup);
                        });
                    });

                    const coloredLayerNodes = Object.values(groupColorMap);

                    const symbols = coloredLayerNodes.map(node => {
                        const wrappedSymbolContent = _symbolWrapper(node);
                        const color = node.getAttribute('data-color');
                        if (color) {
                            wrappedSymbolContent.setAttribute('data-color', color);
                        }
                        const symbol = svgCanvas.makeSymbol(wrappedSymbolContent, [], batchCmd, defChildren);
                        return symbol;
                    });
                    return symbols;
                }
                function _parseSvgByNolayer() {
                    //this is same as parseByLayer .....
                    const defNodes = Array.from(svg.childNodes).filter(node => 'defs' === node.tagName);
                    let defChildren = [];
                    defNodes.map(def => {
                        defChildren = defChildren.concat(Array.from(def.childNodes));
                    });

                    const layerNodes = Array.from(svg.childNodes).filter(node => !['defs', 'title', 'style', 'metadata', 'sodipodi:namedview'].includes(node.tagName));

                    const symbol = svgCanvas.makeSymbol(_symbolWrapper(layerNodes), [], batchCmd, defChildren);

                    return [symbol];
                }
                // return symbols
                _removeSvgText();
                _removeComments();
                switch (type) {
                    case 'color':
                        return {
                            symbols: _parseSvgByColor(svg),
                            confirmedType: 'color'
                        };

                    case 'nolayer':
                    case 'text':
                        return {
                            symbols: _parseSvgByNolayer(svg),
                            confirmedType: 'nolayer'
                        };

                    case 'layer':
                        let symbols = _parseSvgByLayer(svg);
                        if(symbols) {
                            return {
                                symbols: symbols,
                                confirmedType: 'layer'
                            };
                        } else {
                            console.log('Not valid layer. Use nolayer parsing option instead');
                            return {
                                symbols: _parseSvgByNolayer(svg),
                                confirmedType: 'nolayer'
                            };
                        }
                    case 'image-trace':
                        return {
                            symbols: _parseSvgByColor(svg),
                            confirmedType: 'color'
                        };
                }
            }
            function appendUseElement(symbol, type, layerName) {
                // create a use element
                const use_el = svgdoc.createElementNS(NS.SVG, 'use');
                use_el.id = getNextId();
                setHref(use_el, '#' + symbol.id);
                //switch currentLayer, and create layer if necessary
                if ((type === 'layer' && symbol.getAttribute('data-id')) || (type === 'color' && symbol.getAttribute('data-color') || (type === 'image-trace'))) {

                    const color = symbol.getAttribute('data-color');
                    layerName = (type === 'image-trace') ? 'Traced Path' : symbol.getAttribute('data-id') || rgbToHex(color);

                    const isLayerExist = svgCanvas.setCurrentLayer(layerName);
                    if (!isLayerExist) {
                        const layer = svgCanvas.createLayer(layerName);
                        layer.color = color;
                    }
                }
                if (type === 'text') {
                    svgCanvas.setCurrentLayer(layerName);
                }

                getCurrentDrawing().getCurrentLayer().appendChild(use_el);

                if (type === 'nolayer') {
                    use_el.setAttribute('data-wireframe', true);
                }

                $(use_el).data('symbol', symbol).data('ref', symbol);

                use_el.setAttribute('data-symbol', symbol);
                use_el.setAttribute('data-ref', symbol);

                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(use_el));

                return use_el;
            }
            function removeDefaultLayerIfEmpty() {
                const defaultLayerName = LANG.right_panel.layer_panel.layer1;
                const firstLayerTitle = $('#svgcontent g.layer:first-of-type title');
                if (firstLayerTitle.text() === defaultLayerName) {
                    if (firstLayerTitle.siblings().size() === 0) {
                        console.log('default layer is empty. delete it!');
                        svgCanvas.setCurrentLayer(defaultLayerName);
                        svgCanvas.deleteCurrentLayer();
                        window.updateContextPanel();
                        window.populateLayers();
                    }
                }
            }
            function rgbToHex(rgbStr) {
                const rgb = rgbStr.substring(4).split(',');
                let hex = (Math.floor(parseFloat(rgb[0]) * 2.55) * 65536 + Math.floor(parseFloat(rgb[1]) * 2.55) * 256 + Math.floor(parseFloat(rgb[2]) * 2.55)).toString(16);
                if (hex === 'NaN') {
                    hex = '0';
                }
                while (hex.length < 6) {
                    hex = '0' + hex;
                }
                return '#' + hex.toUpperCase(); // ex: #0A23C5
            }
            function setDataXform(use_el, it) {
                const bb = svgedit.utilities.getBBox(use_el);
                let dataXform = '';

                if (it) {
                    dataXform = `x=0 y=0 width=${bb.width} height=${bb.height}`
                } else {
                    $.each(bb, function (key, value) {
                        dataXform += key + '=' + value + ' ';
                    });
                }

                use_el.setAttribute('data-xform', dataXform);
                return use_el;
            }
            function unit2Pixel(val) {
                if ( (val === false) || (val === undefined) || (val === null) ) {
                    return false;
                }

                // is percentage
                if (val.substr(-1) === '%') {
                    console.log('unsupported unit "%" for', val);
                    return;
                }

                const dpi = 72;
                const svgUnitScaling = 254 / dpi; //本來 72 個點代表 1 inch, 現在 254 個點代表 1 inch.
                const unitMap = {
                    'in': 25.4 * 10,
                    'cm': 10 * 10,
                    'mm': 10,
                    'px': svgUnitScaling,
                    'pt': 1
                };

                if (!isNaN(val)) {
                    return val * unitMap['px'];
                }

                const unit = val.substr(-2);
                const num = val.substr(0, val.length-2);
                if (!unitMap[unit]) {
                    console.log('unsupported unit', unit, 'for', val, ' use pixel instead');
                }

                // use pixel if unit is unsupport
                return num * (unitMap[unit] || unitMap['px']);
            }

            const newDoc = svgedit.utilities.text2xml(xmlString);
            svgCanvas.prepareSvg(newDoc);
            const svg = svgdoc.adoptNode(newDoc.documentElement);
            const {symbols, confirmedType} = parseSvg(svg, _type);

            const use_elements = symbols.map(symbol => appendUseElement(symbol, _type, layerName));
            use_elements.map(element => setDataXform(element, _type === 'image-trace'));

            removeDefaultLayerIfEmpty();

            addCommandToHistory(batchCmd);
            call('changed', [svgcontent]);

            // we want to return the element so we can automatically select it
            return use_elements[use_elements.length - 1];

        };

        this.makeSymbol = function (elem, attrs, batchCmd, defs) {
            const symbol = svgdoc.createElementNS(NS.SVG, 'symbol');
            const symbol_defs = svgdoc.createElementNS(NS.SVG, 'defs');
            const oldLinkMap = new Map();

            defs.map(def => {
                this.clipCount = this.clipCount || 1;
                const clonedDef = def.cloneNode(true);
                const oldId = clonedDef.id;
                if (oldId) {
                    const newId = 'def' + (this.clipCount++);
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
            symbol.id = getNextId();
            if (elem.firstChild && elem.firstChild.id) {
                symbol.setAttribute('data-id', elem.firstChild.id);
            }
            if (elem.firstChild && elem.firstChild.getAttribute('data-color')) {
                symbol.setAttribute('data-color', elem.firstChild.getAttribute('data-color'));
            }

            svgedit.utilities.findDefs().appendChild(symbol);

            //remove invisible nodes (such as invisible layer in Illustrator)
            $(symbol).find('*').filter(function () {
                return ($(this).css('display') === 'none');
            }).remove();

            //add prefix(which constrain css selector to symbol's id) to prevent class style pollution
            const originStyle = $(symbol).find('style').text();
            //the regex indicate the css selector, but the selector may contain comma, so we replace it again.
            let prefixedStyle = originStyle.replace(/([^{}]+){/g, function replacer(match, p1, offset, string) {
                const prefix = '#' + symbol.id + ' ';
                match = match.replace(',', ',' + prefix);
                return prefix + match;
            });
            prefixedStyle = prefixedStyle + `
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
                    fill-opacity: 0 !important;
                    stroke: #000 !important;
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

        // TODO(codedread): Move all layer/context functions in draw.js
        // Layer API Functions

        // Group: Layers

        // Function: identifyLayers
        // Updates layer system
        var identifyLayers = canvas.identifyLayers = function () {
            leaveContext();
            getCurrentDrawing().identifyLayers();
        };

        let randomColors = ['#333333','#3F51B5','#F44336','#FFC107','#8BC34A','#2196F3','#009688','#FF9800','#CDDC39','#00BCD4','#FFEB3B','#E91E63','#673AB7','#03A9F4','#9C27B0','#607D8B','#9E9E9E'];

        var getRandomLayerColor = canvas.getRandomLayerColor = function () {
            if (randomColors.length === 0) {
                return '#333';
            }
            return randomColors.shift();
        };

        // Function: createLayer
        // Creates a new top-level layer in the drawing with the given name, sets the current layer
        // to it, and then clears the selection. This function then calls the 'changed' handler.
        // This is an undoable action.
        //
        // Parameters:
        // name - The given name
        this.createLayer = function (name, hrService) {
            let drawing = getCurrentDrawing();
            let new_layer = drawing.createLayer(name, historyRecordingService(hrService));
            if (drawing.layer_map[name]) {
                if (name && name.indexOf('#') === 0) {
                    drawing.layer_map[name].setColor(name);
                } else {
                    drawing.layer_map[name].setColor(getRandomLayerColor());
                }
            }
            clearSelection();
            call('changed', [new_layer]);
            return new_layer;
        };

        /**
         * Creates a new top-level layer in the drawing with the given name, copies all the current layer's contents
         * to it, and then clears the selection. This function then calls the 'changed' handler.
         * This is an undoable action.
         * @param {string} name - The given name. If the layer name exists, a new name will be generated.
         * @param {svgedit.history.HistoryRecordingService} hrService - History recording service
         */
        this.cloneLayer = function (name, hrService) {
            // Clone the current layer and make the cloned layer the new current layer
            var new_layer = getCurrentDrawing().cloneLayer(name, historyRecordingService(hrService));

            clearSelection();
            leaveContext();
            call('changed', [new_layer]);
        };

        // Function: deleteCurrentLayer
        // Deletes the current layer from the drawing and then clears the selection. This function
        // then calls the 'changed' handler. This is an undoable action.
        this.deleteCurrentLayer = function () {
            var current_layer = getCurrentDrawing().getCurrentLayer();
            var nextSibling = current_layer.nextSibling;
            var parent = current_layer.parentNode;
            current_layer = getCurrentDrawing().deleteCurrentLayer();
            if (current_layer) {
                var batchCmd = new svgedit.history.BatchCommand('Delete Layer');
                // store in our Undo History
                batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(current_layer, nextSibling, parent));
                addCommandToHistory(batchCmd);
                clearSelection();
                call('changed', [parent]);
                return true;
            }
            return false;
        };

        // Function: setCurrentLayer
        // Sets the current layer. If the name is not a valid layer name, then this function returns
        // false. Otherwise it returns true. This is not an undo-able action.
        //
        // Parameters:
        // name - the name of the layer you want to switch to.
        //
        // Returns:
        // true if the current layer was switched, otherwise false
        this.setCurrentLayer = function (name) {
            var result = getCurrentDrawing().setCurrentLayer(svgedit.utilities.toXml(name));
            if (result) {
                clearSelection();
            }
            return result;
        };

        // Function: renameCurrentLayer
        // Renames the current layer. If the layer name is not valid (i.e. unique), then this function
        // does nothing and returns false, otherwise it returns true. This is an undo-able action.
        //
        // Parameters:
        // newname - the new name you want to give the current layer. This name must be unique
        // among all layer names.
        //
        // Returns:
        // true if the rename succeeded, false otherwise.
        this.renameCurrentLayer = function (newname) {
            var drawing = getCurrentDrawing();
            var layer = drawing.getCurrentLayer();
            if (layer) {
                var result = drawing.setCurrentLayerName(newname, historyRecordingService());
                if (result) {
                    call('changed', [layer]);
                    return true;
                }
            }
            return false;
        };

        // Function: setCurrentLayerPosition
        // Changes the position of the current layer to the new value. If the new index is not valid,
        // this function does nothing and returns false, otherwise it returns true. This is an
        // undo-able action.
        //
        // Parameters:
        // newpos - The zero-based index of the new position of the layer. This should be between
        // 0 and (number of layers - 1)
        //
        // Returns:
        // true if the current layer position was changed, false otherwise.
        this.setCurrentLayerPosition = function (newpos) {
            var oldpos, drawing = getCurrentDrawing();
            var result = drawing.setCurrentLayerPosition(newpos);
            if (result) {
                addCommandToHistory(new svgedit.history.MoveElementCommand(result.currentGroup, result.oldNextSibling, svgcontent));
                return true;
            }
            return false;
        };

        // Function: setLayerVisibility
        // Sets the visibility of the layer. If the layer name is not valid, this function return
        // false, otherwise it returns true. This is an undo-able action.
        //
        // Parameters:
        // layername - the name of the layer to change the visibility
        // bVisible - true/false, whether the layer should be visible
        //
        // Returns:
        // true if the layer's visibility was set, false otherwise
        this.setLayerVisibility = function (layername, bVisible) {
            var drawing = getCurrentDrawing();
            var prevVisibility = drawing.getLayerVisibility(layername);
            var layer = drawing.setLayerVisibility(layername, bVisible);
            if (layer) {
                var oldDisplay = prevVisibility ? 'inline' : 'none';
                addCommandToHistory(new svgedit.history.ChangeElementCommand(layer, {
                    'display': oldDisplay
                }, 'Layer Visibility'));
            } else {
                return false;
            }

            if (layer === drawing.getCurrentLayer()) {
                clearSelection();
                pathActions.clear();
            }
            //		call('changed', [selected]);
            return true;
        };

        // Function: moveSelectedToLayer
        // Moves the selected elements to layername. If the name is not a valid layer name, then false
        // is returned. Otherwise it returns true. This is an undo-able action.
        //
        // Parameters:
        // layername - the name of the layer you want to which you want to move the selected elements
        //
        // Returns:
        // true if the selected elements were moved to the layer, false otherwise.
        this.moveSelectedToLayer = function (layername) {
            // find the layer
            var i;
            var drawing = getCurrentDrawing();
            var layer = drawing.getLayerByName(layername);
            if (!layer) {
                return false;
            }

            var batchCmd = new svgedit.history.BatchCommand('Move Elements to Layer');

            // loop for each selected element and move it
            var selElems = selectedElements;
            i = selElems.length;
            while (i--) {
                var elem = selElems[i];
                if (!elem) {
                    continue;
                }
                var oldNextSibling = elem.nextSibling;
                // TODO: this is pretty brittle!
                var oldLayer = elem.parentNode;
                layer.appendChild(elem);
                if (this.isUseLayerColor) {
                    this.updateElementColor(elem);
                }
                batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldLayer));
            }

            addCommandToHistory(batchCmd);

            return true;
        };

        this.lockLayer = function (hrService) {
            const currentLayer = getCurrentDrawing().getCurrentLayer();
            currentLayer.setAttribute('data-lock', true);
            currentLayer.setAttribute('class', 'layer lock');
            $('.layersel').addClass('lock');
            getCurrentDrawing().setCurrentLayerPosition(0);
            window.populateLayers();
            clearSelection();
            leaveContext();
        };

        this.unlockLayer = function (layer, hrService) {
            layer.removeAttribute('data-lock');
            layer.setAttribute('class', 'layer');
            clearSelection();
            leaveContext();
        };

        this.mergeLayer = function (hrService) {
            getCurrentDrawing().mergeLayer(historyRecordingService(hrService));
            clearSelection();
            leaveContext();
            call('changed', [svgcontent]);
        };

        this.mergeAllLayers = function (hrService) {
            getCurrentDrawing().mergeAllLayers(historyRecordingService(hrService));
            clearSelection();
            leaveContext();
            call('changed', [svgcontent]);
        };

        this.toggleUseLayerColor = () => {
            this.isUseLayerColor = !(this.isUseLayerColor);
            BeamboxPreference.write('use_layer_color', this.isUseLayerColor);
            require('electron').remote.Menu.getApplicationMenu().items.filter(i => i.id === '_view')[0]
            .submenu.items.filter(i => i.id === 'SHOW_LAYER_COLOR')[0].checked = this.isUseLayerColor;
            const layers = $('#svgcontent > g.layer').toArray();
            layers.forEach(layer => {
                this.updateLayerColor(layer);
            });
        };

        this.updateLayerColor = function(layer) {
            const color = this.isUseLayerColor ? $(layer).attr('data-color') : '#000';
            this.setElementsColor(layer.childNodes, color);
        };

        this.updateElementColor = function(elem) {
            const color = this.isUseLayerColor ? $(this.getObjectLayer(elem).elem).attr('data-color') : '#000';
            this.setElementsColor([elem], color);
        }

        this.setElementsColor = function(elems, color) {
            let ascendents = [...elems];
            let svg_by_color = 0;
            let svg_by_layer = false;
            while (ascendents.length > 0) {
                const elem = ascendents.pop();
                if (elem === 'end datacolor') {
                    svg_by_color -= 1;
                    continue;
                }
                if (elem === 'end by_layer') {
                    svg_by_layer = false;
                    continue;
                }
                const attrStroke = $(elem).attr('stroke');
                const attrFill = $(elem).attr('fill');
                if (['rect', 'ellipse', 'path', 'polygon', 'text', 'line'].includes(elem.tagName)) {
                    if (((svg_by_layer && svg_by_color === 0) || attrStroke) && attrStroke !== 'none') {
                        $(elem).attr('stroke', color);
                    }
                    if (attrFill && attrFill !== 'none') {
                        $(elem).attr('fill', color); 
                    }
                } else if (['g', 'svg', 'symbol'].includes(elem.tagName)) {
                    if ($(elem).data('color')) {
                        ascendents.push('end datacolor');
                        svg_by_color += 1;
                    }
                    ascendents.push(...elem.childNodes);
                } else if (elem.tagName === 'use') {
                    if ($(elem).data('wireframe')) {
                    ascendents.push('end by_layer');
                    svg_by_layer = true;
                    }
                    ascendents.push(...elem.childNodes);
                    const href = $(elem).attr('href') || $(elem).attr('xlink:href');
                    const shadow_root = $(href).toArray();
                    ascendents.push(...shadow_root);
                } else {
                    //console.log(`setElementsColor: unsupported element type ${elem.tagName}`);
                }
            }
        }

        // Function: leaveContext
        // Return from a group context to the regular kind, make any previously
        // disabled elements enabled again
        var leaveContext = this.leaveContext = function () {
            var i, len = disabled_elems.length;
            if (len) {
                for (i = 0; i < len; i++) {
                    var elem = disabled_elems[i];
                    var orig = elData(elem, 'orig_opac');
                    if (orig !== 1) {
                        elem.setAttribute('opacity', orig);
                    } else {
                        elem.removeAttribute('opacity');
                    }
                    elem.setAttribute('style', 'pointer-events: inherit');
                }
                disabled_elems = [];
                clearSelection(true);
                call('contextset', null);
            }
            current_group = null;
        };

        // Function: setContext
        // Set the current context (for in-group editing)
        var setContext = this.setContext = function (elem) {
            leaveContext();
            if (typeof elem === 'string') {
                elem = svgedit.utilities.getElem(elem);
            }

            // Edit inside this group
            current_group = elem;

            // Disable other elements
            $(elem).parentsUntil('#svgcontent').andSelf().siblings().each(function () {
                var opac = this.getAttribute('opacity') || 1;
                // Store the original's opacity
                elData(this, 'orig_opac', opac);
                this.setAttribute('opacity', opac * 0.33);
                this.setAttribute('style', 'pointer-events: none');
                disabled_elems.push(this);
            });

            clearSelection();
            call('contextset', current_group);
        };

        // Group: Document functions

        // Function: clear
        // Clears the current document. This is not an undoable action.
        this.clear = function () {
            pathActions.clear();

            clearSelection();

            // clear the svgcontent node
            canvas.clearSvgContentElement();

            // create new document
            canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent);

            // create empty first layer
            canvas.createLayer(LANG.right_panel.layer_panel.layer1);

            // clear the undo stack
            canvas.undoMgr.resetUndoStack();

            // reset the selector manager
            selectorManager.initGroup();

            // reset the rubber band box
            rubberBox = selectorManager.getRubberBandBox();

            call('cleared');
        };

        // Function: linkControlPoints
        // Alias function
        this.linkControlPoints = pathActions.linkControlPoints;

        // Function: getContentElem
        // Returns the content DOM element
        this.getContentElem = function () {
            return svgcontent;
        };

        // Function: getRootElem
        // Returns the root DOM element
        this.getRootElem = function () {
            return svgroot;
        };

        // Function: getSelectedElems
        // Returns the array with selected DOM elements
        this.getSelectedElems = function () {
            return selectedElements;
        };

        // Function: getTempGroup
        // Returns flag denoted the state of temp group
        this.getTempGroup = function () {
            return tempGroup;
        };

        // Function: getResolution
        // Returns the current dimensions and zoom level in an object
        var getResolution = this.getResolution = function () {
            //		var vb = svgcontent.getAttribute('viewBox').split(' ');
            //		return {'w':vb[2], 'h':vb[3], 'zoom': current_zoom};

            var width = svgcontent.getAttribute('width') / current_zoom;
            var height = svgcontent.getAttribute('height') / current_zoom;

            return {
                'w': width,
                'h': height,
                'zoom': current_zoom
            };
        };

        // Function: getZoom
        // Returns the current zoom level
        this.getZoom = function () {
            return current_zoom;
        };

        // Function: getSnapToGrid
        // Returns the current snap to grid setting
        this.getSnapToGrid = function () {
            return curConfig.gridSnapping;
        };


        // Function: getVersion
        // Returns a string which describes the revision number of SvgCanvas.
        this.getVersion = function () {
            return 'svgcanvas.js ($Rev$)';
        };

        // Function: setUiStrings
        // Update interface strings with given values
        //
        // Parameters:
        // strs - Object with strings (see uiStrings for examples)
        this.setUiStrings = function (strs) {
            $.extend(uiStrings, strs.notification);
        };

        this.toggleBorderless = function () {
            let borderless = BeamboxPreference.read('borderless') || false;
            borderless = !borderless;
            BeamboxPreference.write('borderless', borderless);
            require('electron').remote.Menu.getApplicationMenu().items.filter(i => i.id === '_view')[0]
            .submenu.items.filter(i => i.id === 'BORDERLESS_MODE')[0].checked = borderless;
            //console.log(BeamboxPreference.read('borderless'), typeof(BeamboxPreference.read('borderless')));
        };

        // Function: setConfig
        // Update configuration options with given values
        //
        // Parameters:
        // opts - Object with options (see curConfig for examples)
        this.setConfig = function (opts) {
            $.extend(curConfig, opts);
        };

        // Function: getTitle
        // Returns the current group/SVG's title contents
        this.getTitle = function (elem) {
            var i;
            elem = elem || selectedElements[0];
            if (!elem) {
                return;
            }
            elem = $(elem).data('gsvg') || $(elem).data('symbol') || elem;
            var childs = elem.childNodes;
            for (i = 0; i < childs.length; i++) {
                if (childs[i].nodeName === 'title') {
                    return childs[i].textContent;
                }
            }
            return '';
        };

        // Function: setGroupTitle
        // Sets the group/SVG's title content
        // TODO: Combine this with setDocumentTitle
        this.setGroupTitle = function (val) {
            var elem = selectedElements[0];
            elem = $(elem).data('gsvg') || elem;

            var ts = $(elem).children('title');

            var batchCmd = new svgedit.history.BatchCommand('Set Label');

            if (!val.length) {
                // Remove title element
                var tsNextSibling = ts.nextSibling;
                batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(ts[0], tsNextSibling, elem));
                ts.remove();
            } else if (ts.length) {
                // Change title contents
                var title = ts[0];
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(title, {
                    '#text': title.textContent
                }));
                title.textContent = val;
            } else {
                // Add title element
                title = svgdoc.createElementNS(NS.SVG, 'title');
                title.textContent = val;
                $(elem).prepend(title);
                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(title));
            }

            addCommandToHistory(batchCmd);
        };

        // Function: getDocumentTitle
        // Returns the current document title or an empty string if not found
        var getDocumentTitle = this.getDocumentTitle = function () {
            return canvas.getTitle(svgcontent);
        };

        // Function: setDocumentTitle
        // Adds/updates a title element for the document with the given name.
        // This is an undoable action
        //
        // Parameters:
        // newtitle - String with the new title
        this.setDocumentTitle = function (newtitle) {
            var i;
            var childs = svgcontent.childNodes,
                doc_title = false,
                old_title = '';

            var batchCmd = new svgedit.history.BatchCommand('Change Image Title');

            for (i = 0; i < childs.length; i++) {
                if (childs[i].nodeName === 'title') {
                    doc_title = childs[i];
                    old_title = doc_title.textContent;
                    break;
                }
            }
            if (!doc_title) {
                doc_title = svgdoc.createElementNS(NS.SVG, 'title');
                svgcontent.insertBefore(doc_title, svgcontent.firstChild);
            }

            if (newtitle.length) {
                doc_title.textContent = newtitle;
            } else {
                // No title given, so element is not necessary
                doc_title.parentNode.removeChild(doc_title);
            }
            batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(doc_title, {
                '#text': old_title
            }));
            addCommandToHistory(batchCmd);
        };

        // Function: getEditorNS
        // Returns the editor's namespace URL, optionally adds it to root element
        //
        // Parameters:
        // add - Boolean to indicate whether or not to add the namespace value
        this.getEditorNS = function (add) {
            if (add) {
                svgcontent.setAttribute('xmlns:se', NS.SE);
            }
            return NS.SE;
        };

        // Function: setResolution
        // Changes the document's dimensions to the given size
        //
        // Parameters:
        // x - Number with the width of the new dimensions in user units.
        // Can also be the string "fit" to indicate "fit to content"
        // y - Number with the height of the new dimensions in user units.
        //
        // Returns:
        // Boolean to indicate if resolution change was succesful.
        // It will fail on "fit to content" option with no content to fit to.
        this.setResolution = function (x, y) {
            var res = getResolution();
            var w = res.w,
                h = res.h;
            var batchCmd;

            if (x === 'fit') {
                // Get bounding box
                var bbox = getStrokedBBox();

                if (bbox) {
                    batchCmd = new svgedit.history.BatchCommand('Fit Canvas to Content');
                    var visEls = getVisibleElements();
                    addToSelection(visEls);
                    var dx = [],
                        dy = [];
                    $.each(visEls, function (i, item) {
                        dx.push(bbox.x * -1);
                        dy.push(bbox.y * -1);
                    });

                    var cmd = canvas.moveSelectedElements(dx, dy, true);
                    batchCmd.addSubCommand(cmd);
                    clearSelection();

                    x = Math.round(bbox.width);
                    y = Math.round(bbox.height);
                } else {
                    return false;
                }
            }
            if (x !== w || y !== h) {
                if (!batchCmd) {
                    batchCmd = new svgedit.history.BatchCommand('Change Image Dimensions');
                }

                x = svgedit.units.convertToNum('width', x);
                y = svgedit.units.convertToNum('height', y);

                svgcontent.setAttribute('width', x);
                svgcontent.setAttribute('height', y);

                this.contentW = x;
                this.contentH = y;
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgcontent, {
                    'width': w,
                    'height': h
                }));

                svgcontent.setAttribute('viewBox', [0, 0, x / current_zoom, y / current_zoom].join(' '));
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgcontent, {
                    'viewBox': ['0 0', w, h].join(' ')
                }));

                addCommandToHistory(batchCmd);
                call('changed', [svgcontent]);
            }
            return true;
        };

        // Function: getOffset
        // Returns an object with x, y values indicating the svgcontent element's
        // position in the editor's canvas.
        this.getOffset = function () {
            return $(svgcontent).attr(['x', 'y']);
        };

        // Function: setBBoxZoom
        // Sets the zoom level on the canvas-side based on the given value
        //
        // Parameters:
        // val - Bounding box object to zoom to or string indicating zoom option
        // editor_w - Integer with the editor's workarea box's width
        // editor_h - Integer with the editor's workarea box's height
        // this.setBBoxZoom = function(val, editor_w, editor_h) {
        // var spacer = 0.85;
        // var bb;
        // var calcZoom = function(bb) {
        // 	if (!bb) {return false;}
        // 	var w_zoom = Math.round((editor_w / bb.width)*100 * spacer)/100;
        // 	var h_zoom = Math.round((editor_h / bb.height)*100 * spacer)/100;
        // 	var zoomlevel = Math.min(w_zoom, h_zoom);
        // 	canvas.setZoom(zoomlevel);
        // 	return {'zoom': zoomlevel, 'bbox': bb};
        // };

        // if (typeof val === 'object') {
        // 	bb = val;
        // 	if (bb.width == 0 || bb.height == 0) {
        // 		var newzoom = bb.zoom ? bb.zoom : current_zoom * bb.factor;
        // 		canvas.setZoom(newzoom);
        // 		return {'zoom': current_zoom, 'bbox': bb};
        // 	}
        // 	return calcZoom(bb);
        // }

        // switch (val) {
        // 	case 'selection':
        // 		if (!selectedElements[0]) {return;}
        // 		var sel_elems = $.map(selectedElements, function(n){ if (n) {return n;} });
        // 		bb = getStrokedBBox(sel_elems);
        // 		break;
        // 	case 'canvas':
        // 		var res = getResolution();
        // 		spacer = 0.95;
        // 		bb = {width:res.w, height:res.h , x:0, y:0};
        // 		break;
        // 	case 'content':
        // 		bb = getStrokedBBox();
        // 		break;
        // 	case 'layer':
        // 		bb = getStrokedBBox(getVisibleElements(getCurrentDrawing().getCurrentLayer()));
        // 		break;
        // 	default:
        // 		return;
        // }
        // return calcZoom(bb);
        // };

        // Function: setZoom
        // Sets the zoom to the given level
        //
        // Parameters:
        // zoomlevel - Float indicating the zoom level to change to
        this.setZoom = function (zoomlevel) {
            var res = getResolution();
            svgcontent.setAttribute('viewBox', '0 0 ' + res.w / zoomlevel + ' ' + res.h / zoomlevel);
            current_zoom = zoomlevel;
            $.each(selectedElements, function (i, elem) {
                if (!elem) {
                    return;
                }
                selectorManager.requestSelector(elem).resize();
            });
            pathActions.zoomChange();
            runExtensions('zoomChanged', zoomlevel);
        };

        // Function: getMode
        // Returns the current editor mode string
        this.getMode = function () {
            return current_mode;
        };

        // Function: setMode
        // Sets the editor's mode to the given string
        //
        // Parameters:
        // name - String with the new mode to change to
        this.setMode = function (name) {
            pathActions.clear(true);
            textActions.clear();
            cur_properties = (selectedElements[0] && selectedElements[0].nodeName === 'text') ? cur_text : cur_shape;
            current_mode = name;
            if (name === 'path') {
                this.collectAlignPoints();
            }
        };

        this.toggleBezierPathAlignToEdge = () => {
            isBezierPathAlignToEdge = !(this.isBezierPathAlignToEdge || false);
            this.isBezierPathAlignToEdge = isBezierPathAlignToEdge;
            require('electron').remote.Menu.getApplicationMenu().items.filter(i => i.id === '_edit')[0]
            .submenu.items.filter(i => i.id === 'ALIGN_TO_EDGES')[0].checked = this.isBezierPathAlignToEdge;
            $('#x_align_line').remove();
            $('#y_align_line').remove();
        }

        this.drawAlignLine = function (x, y, xMatchPoint, yMatchPoint) {
            let xAlignLine = svgedit.utilities.getElem('x_align_line');
            if (xMatchPoint) {
                if (!xAlignLine) {
                    xAlignLine = document.createElementNS(NS.SVG, 'path');
                    svgedit.utilities.assignAttributes(xAlignLine, {
                        id: 'x_align_line',
                        stroke: '#FA6161',
                        'stroke-width': '5',
                        fill: 'none'
                    });
                    svgedit.utilities.getElem('svgcontent').appendChild(xAlignLine);
                } 
                xAlignLine.setAttribute('d', `M ${xMatchPoint.x} ${xMatchPoint.y} L ${xMatchPoint.x} ${yMatchPoint ? yMatchPoint.y : y / current_zoom}`)
                xAlignLine.setAttribute('display', 'inline');
            } else {
                if (xAlignLine) {
                    xAlignLine.setAttribute('display', 'none');
                }
            }
            let yAlignLine = svgedit.utilities.getElem('y_align_line');
            if (yMatchPoint) {    
                if (!yAlignLine) {
                    yAlignLine = document.createElementNS(NS.SVG, 'path');
                    svgedit.utilities.assignAttributes(yAlignLine, {
                        id: 'y_align_line',
                        stroke: '#FA6161',
                        'stroke-width': '5',
                        fill: 'none'
                    });
                    svgedit.utilities.getElem('svgcontent').appendChild(yAlignLine);
                } 
                yAlignLine.setAttribute('d', `M ${yMatchPoint.x} ${yMatchPoint.y} L ${xMatchPoint ? xMatchPoint.x : x / current_zoom} ${yMatchPoint.y}`)
                yAlignLine.setAttribute('display', 'inline');
            } else {
                if (yAlignLine) {
                    yAlignLine.setAttribute('display', 'none');
                }
            }
        }

        this.findMatchPoint = function(x, y) {
            const FUZZY_RANGE = 7;
            const bsFindNearest = function(array ,val) {
                let l = 0,
                    u = array.length - 1;
                if (val <= array[l]) {
                    return l;
                } else if (val >= array[u]) {
                    return u;
                }
                let m;
                while (u > l) {
                    m = parseInt(l + 0.5 * (u-l));
                    if (array[m] === val) {
                        return m;
                    } else if (array[m] > val) {
                        u = m - 1;
                    } else {
                        if (m === array.length - 1) {
                            return m;
                        } else if (array[m+1] > val) {
                            return array[m+1] + array[m] > 2 * val ? m : m+1
                        } else {
                            l = m + 1;
                        }
                    }
                }
                if (u ===  array.length - 1) {
                    return u;
                } else {
                    return array[u+1] + array[u] > 2 * val ? u : u+1
                }
            }
            let nearestX = bsFindNearest(this.pathAlignPointsSortByX.map(p => p.x), x / current_zoom);
            nearestX = this.pathAlignPointsSortByX[nearestX];
            let xMatchPoint = nearestX ? (Math.abs(nearestX.x * current_zoom - x) < FUZZY_RANGE ? nearestX : null) : null;
            let nearestY = bsFindNearest(this.pathAlignPointsSortByY.map(p => p.y), y / current_zoom);
            nearestY = this.pathAlignPointsSortByY[nearestY];
            let yMatchPoint = nearestY ? (Math.abs(nearestY.y * current_zoom - y) < FUZZY_RANGE ? nearestY : null): null;
            return {xMatchPoint, yMatchPoint};
        }

        this.collectAlignPoints = () => {
            let elems = []; 
            const layers = $('#svgcontent > g.layer').toArray();
            layers.forEach(layer => {
                elems.push(...layer.childNodes);
            });
            let points = [];
            while (elems.length > 0){
                const elem = elems.pop();
                points.push(...this.getElemAlignPoints(elem));
            }
            this.pathAlignPointsSortByX = points.sort(function (a, b) {
                return a.x > b.x ? 1 : -1;
            });
            this.pathAlignPointsSortByY = [...points].sort(function (a, b) {
                return a.y > b.y ? 1 : -1;
            });
        };

        this.addAlignPoint = function(x, y) {
            const newPoint = {x, y};
            let p = 0;
            for (let i = 0; i < this.pathAlignPointsSortByX.length; ++i) {
                if (x <= this.pathAlignPointsSortByX[i].x) {
                    break;
                }
                p += 1;
            }
            this.pathAlignPointsSortByX.splice(p, 0, newPoint);
            p = 0;
            for (let i = 0; i < this.pathAlignPointsSortByY.length; ++i) {
                if (y <= this.pathAlignPointsSortByY[i].y) {
                    break;
                }
                p += 1;
            }
            this.pathAlignPointsSortByY.splice(p, 0, newPoint);
        };

        this.getElemAlignPoints = function(elem) {
            if (['rect', 'ellipse', 'polygon', 'path', 'image', 'use'].includes(elem.tagName)) {
                let bbox;
                if (elem.tagName === 'use') {
                    bbox = this.getSvgRealLocation(elem);
                } else {
                    bbox = elem.getBBox();
                }
                const center = {x: bbox.x + 0.5 * bbox.width, y: bbox.y + 0.5 * bbox.height};
                const angle = svgedit.utilities.getRotationAngle(elem, true);
                let points = [];
                switch (elem.tagName) {
                    case 'rect':
                    case 'image':
                    case 'use':
                        points = [
                            {x: bbox.x, y: bbox.y},
                            {x: bbox.x + bbox.width, y: bbox.y},
                            {x: bbox.x, y: bbox.y + bbox.height},
                            {x: bbox.x + bbox.width, y: bbox.y + bbox.height},
                            {x: bbox.x, y: bbox.y + 0.5 * bbox.height},
                            {x: bbox.x + bbox.width, y: bbox.y + 0.5 * bbox.height},
                            {x: bbox.x + 0.5 * bbox.width, y: bbox.y + bbox.height},
                            {x: bbox.x + 0.5 * bbox.width, y: bbox.y + bbox.height},
                        ];
                        break;
                    case 'ellipse':
                        points = [];
                        let a = 0.5 * bbox.width;
                        let b = 0.5 * bbox.height;
                        let theta = Math.atan2(-b * Math.tan(angle), a);
                        points.push({x: center.x + a * Math.cos(theta), y: center.y + b * Math.sin(theta)});
                        theta = Math.atan2(b * Math.tan(angle), -a);
                        points.push({x: center.x + a * Math.cos(theta), y: center.y + b * Math.sin(theta)});
                        theta = Math.atan2(b * Math.cos(angle), a * Math.sin(angle));
                        points.push({x: center.x + a * Math.cos(theta), y: center.y + b * Math.sin(theta)});
                        theta = Math.atan2(-b * Math.cos(angle), -a * Math.sin(angle));
                        points.push({x: center.x + a * Math.cos(theta), y: center.y + b * Math.sin(theta)});
                        points.push(center);
                        break;
                    case 'polygon':
                        points = elem.getAttribute('points').split(' ');
                        points = points.slice(0, points.length-1);
                        points = points.map(i => {
                            i = i.split(',');
                            return {x: parseFloat(i[0]), y: parseFloat(i[1])};
                        });
                        break;
                    case 'path':
                        points = [];
                        elem.pathSegList._list.forEach(seg => {
                            if (seg.x) {
                                points.push({x: parseFloat(seg.x), y: parseFloat(seg.y)})
                            }
                        });
                        break;
                    default:
                        break;
                }
                
                points.forEach(p => {
                    const newX = center.x + (p.x - center.x) * Math.cos(angle) - (p.y - center.y) * Math.sin(angle);
                    const newY = center.y + (p.x - center.x) * Math.sin(angle) + (p.y - center.y) * Math.cos(angle);
                    p.x = newX;
                    p.y = newY;
                });
                return points;
            } else {
                return [];
            }
        };

        // Group: Element Styling

        // Function: getColor
        // Returns the current fill/stroke option
        this.getColor = function (type) {
            return cur_properties[type];
        };

        // Function: setColor
        // Change the current stroke/fill color/gradient value
        //
        // Parameters:
        // type - String indicating fill or stroke
        // val - The value to set the stroke attribute to
        // preventUndo - Boolean indicating whether or not this should be and undoable option
        this.setColor = function (type, val, preventUndo) {
            cur_shape[type] = val;
            cur_properties[type + '_paint'] = {
                type: 'solidColor'
            };
            var elems = [];

            function addNonG(e) {
                if (e.nodeName !== 'g') {
                    elems.push(e);
                }
            }
            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                if (elem) {
                    if (elem.tagName === 'g') {
                        svgedit.utilities.walkTree(elem, addNonG);
                    } else {
                        if (type === 'fill') {
                            if (elem.tagName !== 'polyline' && elem.tagName !== 'line') {
                                elems.push(elem);
                            }
                        } else {
                            elems.push(elem);
                        }
                    }
                }
            }
            if (elems.length > 0) {
                if (!preventUndo) {
                    changeSelectedAttribute(type, val, elems);
                    call('changed', elems);
                } else {
                    changeSelectedAttributeNoUndo(type, val, elems);
                }
            }
        };

        // Function: setGradient
        // Apply the current gradient to selected element's fill or stroke
        //
        // Parameters
        // type - String indicating "fill" or "stroke" to apply to an element
        var setGradient = this.setGradient = function (type) {
            if (!cur_properties[type + '_paint'] || cur_properties[type + '_paint'].type === 'solidColor') {
                return;
            }
            var grad = canvas[type + 'Grad'];
            // find out if there is a duplicate gradient already in the defs
            var duplicate_grad = findDuplicateGradient(grad);
            var defs = svgedit.utilities.findDefs();
            // no duplicate found, so import gradient into defs
            if (!duplicate_grad) {
                var orig_grad = grad;
                grad = defs.appendChild(svgdoc.importNode(grad, true));
                // get next id and set it on the grad
                grad.id = getNextId();
            } else { // use existing gradient
                grad = duplicate_grad;
            }
            canvas.setColor(type, 'url(#' + grad.id + ')');
        };

        // Function: findDuplicateGradient
        // Check if exact gradient already exists
        //
        // Parameters:
        // grad - The gradient DOM element to compare to others
        //
        // Returns:
        // The existing gradient if found, null if not
        var findDuplicateGradient = function (grad) {
            var defs = svgedit.utilities.findDefs();
            var existing_grads = $(defs).find('linearGradient, radialGradient');
            var i = existing_grads.length;
            var rad_attrs = ['r', 'cx', 'cy', 'fx', 'fy'];
            while (i--) {
                var og = existing_grads[i];
                if (grad.tagName === 'linearGradient') {
                    if (grad.getAttribute('x1') != og.getAttribute('x1') ||
                        grad.getAttribute('y1') != og.getAttribute('y1') ||
                        grad.getAttribute('x2') != og.getAttribute('x2') ||
                        grad.getAttribute('y2') != og.getAttribute('y2')) {
                        continue;
                    }
                } else {
                    var grad_attrs = $(grad).attr(rad_attrs);
                    var og_attrs = $(og).attr(rad_attrs);

                    var diff = false;
                    $.each(rad_attrs, function (i, attr) {
                        if (grad_attrs[attr] != og_attrs[attr]) {
                            diff = true;
                        }
                    });

                    if (diff) {
                        continue;
                    }
                }

                // else could be a duplicate, iterate through stops
                var stops = grad.getElementsByTagNameNS(NS.SVG, 'stop');
                var ostops = og.getElementsByTagNameNS(NS.SVG, 'stop');

                if (stops.length !== ostops.length) {
                    continue;
                }

                var j = stops.length;
                while (j--) {
                    var stop = stops[j];
                    var ostop = ostops[j];

                    if (stop.getAttribute('offset') != ostop.getAttribute('offset') ||
                        stop.getAttribute('stop-opacity') != ostop.getAttribute('stop-opacity') ||
                        stop.getAttribute('stop-color') != ostop.getAttribute('stop-color')) {
                        break;
                    }
                }

                if (j === -1) {
                    return og;
                }
            } // for each gradient in defs

            return null;
        };

        function reorientGrads(elem, m) {
            var i;
            var bb = svgedit.utilities.getBBox(elem);
            for (i = 0; i < 2; i++) {
                var type = i === 0 ? 'fill' : 'stroke';
                var attrVal = elem.getAttribute(type);
                if (attrVal && attrVal.indexOf('url(') === 0) {
                    var grad = svgedit.utilities.getRefElem(attrVal);
                    if (grad.tagName === 'linearGradient') {
                        var x1 = grad.getAttribute('x1') || 0;
                        var y1 = grad.getAttribute('y1') || 0;
                        var x2 = grad.getAttribute('x2') || 1;
                        var y2 = grad.getAttribute('y2') || 0;

                        // Convert to USOU points
                        x1 = (bb.width * x1) + bb.x;
                        y1 = (bb.height * y1) + bb.y;
                        x2 = (bb.width * x2) + bb.x;
                        y2 = (bb.height * y2) + bb.y;

                        // Transform those points
                        var pt1 = svgedit.math.transformPoint(x1, y1, m);
                        var pt2 = svgedit.math.transformPoint(x2, y2, m);

                        // Convert back to BB points
                        var g_coords = {};

                        g_coords.x1 = (pt1.x - bb.x) / bb.width;
                        g_coords.y1 = (pt1.y - bb.y) / bb.height;
                        g_coords.x2 = (pt2.x - bb.x) / bb.width;
                        g_coords.y2 = (pt2.y - bb.y) / bb.height;

                        var newgrad = grad.cloneNode(true);
                        $(newgrad).attr(g_coords);

                        newgrad.id = getNextId();
                        svgedit.utilities.findDefs().appendChild(newgrad);
                        elem.setAttribute(type, 'url(#' + newgrad.id + ')');
                    }
                }
            }
        }

        // Function: setPaint
        // Set a color/gradient to a fill/stroke
        //
        // Parameters:
        // type - String with "fill" or "stroke"
        // paint - The jGraduate paint object to apply
        this.setPaint = function (type, paint) {
            // make a copy
            var p = new $.jGraduate.Paint(paint);
            this.setPaintOpacity(type, p.alpha / 100, true);

            // now set the current paint object
            cur_properties[type + '_paint'] = p;
            switch (p.type) {
                case 'solidColor':
                    this.setColor(type, p.solidColor !== 'none' ? '#' + p.solidColor : 'none');
                    break;
                case 'linearGradient':
                case 'radialGradient':
                    canvas[type + 'Grad'] = p[p.type];
                    setGradient(type);
                    break;
            }
        };

        // alias
        this.setStrokePaint = function (paint) {
            this.setPaint('stroke', paint);
        };

        this.setFillPaint = function (paint) {
            this.setPaint('fill', paint);
        };

        // Function: getStrokeWidth
        // Returns the current stroke-width value
        this.getStrokeWidth = function () {
            return cur_properties.stroke_width;
        };

        // Function: setStrokeWidth
        // Sets the stroke width for the current selected elements
        // When attempting to set a line's width to 0, this changes it to 1 instead
        //
        // Parameters:
        // val - A Float indicating the new stroke width value
        this.setStrokeWidth = function (val) {
            if (val == 0 && ['line', 'path'].indexOf(current_mode) >= 0) {
                canvas.setStrokeWidth(1);
                return;
            }
            cur_properties.stroke_width = val;

            var elems = [];

            function addNonG(e) {
                if (e.nodeName !== 'g') {
                    elems.push(e);
                }
            }
            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                if (elem) {
                    if (elem.tagName === 'g') {
                        svgedit.utilities.walkTree(elem, addNonG);
                    } else {
                        elems.push(elem);
                    }
                }
            }
            if (elems.length > 0) {
                changeSelectedAttribute('stroke-width', val, elems);
                call('changed', selectedElements);
            }
        };

        // Function: setStrokeAttr
        // Set the given stroke-related attribute the given value for selected elements
        //
        // Parameters:
        // attr - String with the attribute name
        // val - String or number with the attribute value
        this.setStrokeAttr = function (attr, val) {
            cur_shape[attr.replace('-', '_')] = val;
            var elems = [];

            function addNonG(e) {
                if (e.nodeName !== 'g') {
                    elems.push(e);
                }
            }
            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                if (elem) {
                    if (elem.tagName === 'g') {
                        svgedit.utilities.walkTree(elem, function (e) {
                            if (e.nodeName !== 'g') {
                                elems.push(e);
                            }
                        });
                    } else {
                        elems.push(elem);
                    }
                }
            }
            if (elems.length > 0) {
                changeSelectedAttribute(attr, val, elems);
                call('changed', selectedElements);
            }
        };

        // Function: getStyle
        // Returns current style options
        this.getStyle = function () {
            return cur_shape;
        };

        // Function: getOpacity
        // Returns the current opacity
        this.getOpacity = function () {
            return cur_shape.opacity;
        };

        // Function: setOpacity
        // Sets the given opacity to the current selected elements
        this.setOpacity = function (val) {
            cur_shape.opacity = val;
            changeSelectedAttribute('opacity', val);
        };

        // Function: getOpacity
        // Returns the current fill opacity
        this.getFillOpacity = function () {
            return cur_shape.fill_opacity;
        };

        // Function: getStrokeOpacity
        // Returns the current stroke opacity
        this.getStrokeOpacity = function () {
            return cur_shape.stroke_opacity;
        };

        // Function: setPaintOpacity
        // Sets the current fill/stroke opacity
        //
        // Parameters:
        // type - String with "fill" or "stroke"
        // val - Float with the new opacity value
        // preventUndo - Boolean indicating whether or not this should be an undoable action
        this.setPaintOpacity = function (type, val, preventUndo) {
            cur_shape[type + '_opacity'] = val;
            if (!preventUndo) {
                changeSelectedAttribute(type + '-opacity', val);
            } else {
                changeSelectedAttributeNoUndo(type + '-opacity', val);
            }
        };

        // Function: getPaintOpacity
        // Gets the current fill/stroke opacity
        //
        // Parameters:
        // type - String with "fill" or "stroke"
        this.getPaintOpacity = function (type) {
            return type === 'fill' ? this.getFillOpacity() : this.getStrokeOpacity();
        };

        // Function: getBlur
        // Gets the stdDeviation blur value of the given element
        //
        // Parameters:
        // elem - The element to check the blur value for
        this.getBlur = function (elem) {
            var val = 0;
            //	var elem = selectedElements[0];

            if (elem) {
                var filter_url = elem.getAttribute('filter');
                if (filter_url) {
                    var blur = svgedit.utilities.getElem(elem.id + '_blur');
                    if (blur) {
                        val = blur.firstChild.getAttribute('stdDeviation');
                    }
                }
            }
            return val;
        };

        (function () {
            var cur_command = null;
            var filter = null;
            var filterHidden = false;

            // Function: setBlurNoUndo
            // Sets the stdDeviation blur value on the selected element without being undoable
            //
            // Parameters:
            // val - The new stdDeviation value
            canvas.setBlurNoUndo = function (val) {
                if (!filter) {
                    canvas.setBlur(val);
                    return;
                }
                if (val === 0) {
                    // Don't change the StdDev, as that will hide the element.
                    // Instead, just remove the value for "filter"
                    changeSelectedAttributeNoUndo('filter', '');
                    filterHidden = true;
                } else {
                    var elem = selectedElements[0];
                    if (filterHidden) {
                        changeSelectedAttributeNoUndo('filter', 'url(#' + elem.id + '_blur)');
                    }
                    if (svgedit.browser.isWebkit()) {
                        console.log('e', elem);
                        elem.removeAttribute('filter');
                        elem.setAttribute('filter', 'url(#' + elem.id + '_blur)');
                    }
                    changeSelectedAttributeNoUndo('stdDeviation', val, [filter.firstChild]);
                    canvas.setBlurOffsets(filter, val);
                }
            };

            function finishChange() {
                var bCmd = canvas.undoMgr.finishUndoableChange();
                cur_command.addSubCommand(bCmd);
                addCommandToHistory(cur_command);
                cur_command = null;
                filter = null;
            }

            // Function: setBlurOffsets
            // Sets the x, y, with, height values of the filter element in order to
            // make the blur not be clipped. Removes them if not neeeded
            //
            // Parameters:
            // filter - The filter DOM element to update
            // stdDev - The standard deviation value on which to base the offset size
            canvas.setBlurOffsets = function (filter, stdDev) {
                if (stdDev > 3) {
                    // TODO: Create algorithm here where size is based on expected blur
                    svgedit.utilities.assignAttributes(filter, {
                        x: '-50%',
                        y: '-50%',
                        width: '200%',
                        height: '200%'
                    }, 100);
                } else {
                    // Removing these attributes hides text in Chrome (see Issue 579)
                    if (!svgedit.browser.isWebkit()) {
                        filter.removeAttribute('x');
                        filter.removeAttribute('y');
                        filter.removeAttribute('width');
                        filter.removeAttribute('height');
                    }
                }
            };

            // Function: setBlur
            // Adds/updates the blur filter to the selected element
            //
            // Parameters:
            // val - Float with the new stdDeviation blur value
            // complete - Boolean indicating whether or not the action should be completed (to add to the undo manager)
            canvas.setBlur = function (val, complete) {
                if (cur_command) {
                    finishChange();
                    return;
                }

                // Looks for associated blur, creates one if not found
                var elem = selectedElements[0];
                var elem_id = elem.id;
                filter = svgedit.utilities.getElem(elem_id + '_blur');

                val -= 0;

                var batchCmd = new svgedit.history.BatchCommand();

                // Blur found!
                if (filter) {
                    if (val === 0) {
                        filter = null;
                    }
                } else {
                    // Not found, so create
                    var newblur = addSvgElementFromJson({
                        'element': 'feGaussianBlur',
                        'attr': {
                            'in': 'SourceGraphic',
                            'stdDeviation': val
                        }
                    });

                    filter = addSvgElementFromJson({
                        'element': 'filter',
                        'attr': {
                            'id': elem_id + '_blur'
                        }
                    });

                    filter.appendChild(newblur);
                    svgedit.utilities.findDefs().appendChild(filter);

                    batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(filter));
                }

                var changes = {
                    filter: elem.getAttribute('filter')
                };

                if (val === 0) {
                    elem.removeAttribute('filter');
                    batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
                    return;
                }

                changeSelectedAttribute('filter', 'url(#' + elem_id + '_blur)');
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
                canvas.setBlurOffsets(filter, val);

                cur_command = batchCmd;
                canvas.undoMgr.beginUndoableChange('stdDeviation', [filter ? filter.firstChild : null]);
                if (complete) {
                    canvas.setBlurNoUndo(val);
                    finishChange();
                }
            };
        })();

        // Function: getBold
        // Check whether selected element is bold or not
        //
        // Returns:
        // Boolean indicating whether or not element is bold
        this.getBold = function () {
            // should only have one element selected
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                return (selected.getAttribute('font-weight') === 'bold');
            }
            return false;
        };

        // Function: setBold
        // Make the selected element bold or normal
        //
        // Parameters:
        // b - Boolean indicating bold (true) or normal (false)
        this.setBold = function (b) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                changeSelectedAttribute('font-weight', b ? 'bold' : 'normal');
            }
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        // Function: getItalic
        // Check whether selected element is italic or not
        //
        // Returns:
        // Boolean indicating whether or not element is italic
        this.getItalic = function () {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                return (selected.getAttribute('font-style') === 'italic');
            }
            return false;
        };

        // Function: setItalic
        // Make the selected element italic or normal
        //
        // Parameters:
        // b - Boolean indicating italic (true) or normal (false)
        this.setItalic = function (i) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                changeSelectedAttribute('font-style', i ? 'italic' : 'normal');
            }
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        this.getFontWeight = function () {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                return selected.getAttribute('font-weight');
            }
            return false;
        };

        this.setFontWeight = function (i) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                changeSelectedAttribute('font-weight', i ? i : 'normal');
            }
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        this.getFontIsFill = function () {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                const fillAttr = selected.getAttribute('fill');
                if (selected.getAttribute('fill-opacity') === '0') {
                    return false;
                }
                if (['#fff', '#ffffff', 'none'].includes(fillAttr)) {
                    return false;
                } else if(fillAttr || fillAttr === null) {
                    return true;
                } else {
                    return false;
                }
            }
            return false;
        };

        this.setFontIsFill = function (isFill) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                const color = this.isUseLayerColor ? $(this.getObjectLayer(selected).elem).attr('data-color') : '#000';
                changeSelectedAttribute('fill', isFill ? color : '#fff');
                changeSelectedAttribute('fill-opacity', isFill ? 1 : 0);
                changeSelectedAttribute('stroke', isFill ? 'none' : color);
            }
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        this.getLetterSpacing = function () {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                let val = selected.getAttribute('letter-spacing');
                if(val) {
                    if (val.toLowerCase().endsWith('em')) {
                        return val.slice(0, -2);
                    } else {
                        console.warn('letter-spacing should be em!');
                        return 0;
                    }
                } else {
                    return 0;
                }
                return val;
            }
            return false;
        };

        this.setLetterSpacing = function (val) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'text' &&
                selectedElements[1] == null) {
                changeSelectedAttribute('letter-spacing', val ? (val.toString() + 'em') : '0em');
            }
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        // Function: getFontFamily
        // Returns the current font family
        this.getFontFamily = function () {
            return cur_text.font_family;
        };

        // Function: setFontFamily
        // Set the new font family
        //
        // Parameters:
        // val - String with the new font family
        this.setFontFamily = function (val) {
            cur_text.font_family = val;
            changeSelectedAttribute('font-family', val);
            if (selectedElements[0] && !selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };


        // Function: setFontColor
        // Set the new font color
        //
        // Parameters:
        // val - String with the new font color
        this.setFontColor = function (val) {
            cur_text.fill = val;
            changeSelectedAttribute('fill', val);
        };

        // Function: getFontColor
        // Returns the current font color
        this.getFontColor = function () {
            return cur_text.fill;
        };

        // Function: getFontSize
        // Returns the current font size
        this.getFontSize = function () {
            return cur_text.font_size;
        };

        // Function: setFontSize
        // Applies the given font size to the selected element
        //
        // Parameters:
        // val - Float with the new font size
        this.setFontSize = function (val) {
            cur_text.font_size = val;
            changeSelectedAttribute('font-size', val);
            if (!selectedElements[0].textContent) {
                textActions.setCursor();
            }
        };

        // Function: getText
        // Returns the current text (textContent) of the selected element
        this.getText = function () {
            var selected = selectedElements[0];
            if (selected == null) {
                return '';
            }
            return selected.textContent;
        };

        // Function: setTextContent
        // Updates the text element with the given string
        //
        // Parameters:
        // val - String with the new text
        this.setTextContent = function (val) {
            changeSelectedAttribute('#text', val);
            textActions.init(val);
            textActions.setCursor();
        };

        // Function: setImageURL
        // Sets the new image URL for the selected image element. Updates its size if
        // a new URL is given
        //
        // Parameters:
        // val - String with the image URL/path
        this.setImageURL = function (val) {
            var elem = selectedElements[0];
            if (!elem) {
                return;
            }

            var attrs = $(elem).attr(['width', 'height']);
            var setsize = (!attrs.width || !attrs.height);

            var cur_href = getHref(elem);

            // Do nothing if no URL change or size change
            if (cur_href !== val) {
                setsize = true;
            } else if (!setsize) {
                return;
            }

            var batchCmd = new svgedit.history.BatchCommand('Change Image URL');

            setHref(elem, val);
            batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, {
                '#href': cur_href
            }));

            if (setsize) {
                $(new Image()).load(function () {
                    var changes = $(elem).attr(['width', 'height']);

                    $(elem).attr({
                        width: this.width,
                        height: this.height
                    });

                    selectorManager.requestSelector(elem).resize();

                    batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
                    addCommandToHistory(batchCmd);
                    call('changed', [elem]);
                }).attr('src', val);
            } else {
                addCommandToHistory(batchCmd);
            }
        };

        // Function: setLinkURL
        // Sets the new link URL for the selected anchor element.
        //
        // Parameters:
        // val - String with the link URL/path
        this.setLinkURL = function (val) {
            var elem = selectedElements[0];
            if (!elem) {
                return;
            }
            if (elem.tagName !== 'a') {
                // See if parent is an anchor
                var parents_a = $(elem).parents('a');
                if (parents_a.length) {
                    elem = parents_a[0];
                } else {
                    return;
                }
            }

            var cur_href = getHref(elem);

            if (cur_href === val) {
                return;
            }

            var batchCmd = new svgedit.history.BatchCommand('Change Link URL');

            setHref(elem, val);
            batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, {
                '#href': cur_href
            }));

            addCommandToHistory(batchCmd);
        };


        // Function: setRectRadius
        // Sets the rx & ry values to the selected rect element to change its corner radius
        //
        // Parameters:
        // val - The new radius
        this.setRectRadius = function (val) {
            var selected = selectedElements[0];
            if (selected != null && selected.tagName === 'rect') {
                var r = selected.getAttribute('rx');
                if (r != val) {
                    selected.setAttribute('rx', val);
                    selected.setAttribute('ry', val);
                    addCommandToHistory(new svgedit.history.ChangeElementCommand(selected, {
                        'rx': r,
                        'ry': r
                    }, 'Radius'));
                    call('changed', [selected]);
                }
            }
        };

        this.setSelectedFill = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            for (let i = 0; i < selectedElements.length; ++i) {
                elem = selectedElements[i];
                if (elem == null) {
                    break;
                }
                const availableType = ['rect', 'ellipse', 'path', 'text', 'polygon'];

                if (availableType.indexOf(elem.tagName) >= 0) {
                    const color = $(elem).attr('stroke');
                    this.setElementFill(elem, color);
                } else {
                    console.log(`Not support type: ${elem.tagName}`)
                }
            }
        }

        this.setElementFill = function (elem, color) {
            let batchCmd = new svgedit.history.BatchCommand('set fill');
            canvas.undoMgr.beginUndoableChange('fill', [elem]);
            elem.setAttribute('fill', color);
            batchCmd.addSubCommand(canvas.undoMgr.finishUndoableChange());
            canvas.undoMgr.beginUndoableChange('fill-opacity', [elem]);
            elem.setAttribute('fill-opacity', 1);
            batchCmd.addSubCommand(canvas.undoMgr.finishUndoableChange());
            canvas.undoMgr.addCommandToHistory(batchCmd);
        }

        this.setSelectedUnfill = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            for (let i = 0; i < selectedElements.length; ++i) {
                elem = selectedElements[i];
                if (elem == null) {
                    break;
                }
                const availableType = ['rect', 'ellipse', 'path', 'text', 'polygon'];

                if (availableType.indexOf(elem.tagName) >= 0) {
                    const color = $(elem).attr('fill');
                    this.setElementUnfill(elem, color);
                } else {
                    console.log(`Not support type: ${elem.tagName}`)
                }
            }
        }

        this.setElementUnfill = function (elem, color) {
            let batchCmd = new svgedit.history.BatchCommand('set unfill');
            canvas.undoMgr.beginUndoableChange('stroke', [elem]);
            elem.setAttribute('stroke', color);
            batchCmd.addSubCommand(canvas.undoMgr.finishUndoableChange());
            canvas.undoMgr.beginUndoableChange('fill-opacity', [elem]);
            elem.setAttribute('fill-opacity', 0);
            batchCmd.addSubCommand(canvas.undoMgr.finishUndoableChange());
            canvas.undoMgr.addCommandToHistory(batchCmd);
        }

        // Function: makeHyperlink
        // Wraps the selected element(s) in an anchor element or converts group to one
        this.makeHyperlink = function (url) {
            canvas.groupSelectedElements('a', url);

            // TODO: If element is a single "g", convert to "a"
            //	if (selectedElements.length > 1 && selectedElements[1]) {

        };

        // Function: removeHyperlink
        this.removeHyperlink = function () {
            canvas.ungroupSelectedElement();
        };

        // Function: imageToSVG
        // tracing an image file, convert it to svg object
        // using ImageTracer https://github.com/jankovicsandras/imagetracerjs
        this.imageToSVG = function (img) {
            if (img == null) {
                img = selectedElements[0];
            }
            let batchCmd = new svgedit.history.BatchCommand('Vectorize Image');
            const imgUrl = $(img).attr('xlink:href');
            ImageTracer.imageToSVG(imgUrl, svgstr => {
                const id = getNextId();
                let g = addSvgElementFromJson({
                    'element': 'g',
                    'attr': {
                        'id': id
                    }
                });
                svgstr = svgstr.replace(/<\/?svg[^>]*>/g, '');
                ImageTracer.appendSVGString(svgstr, id);
                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));
                if (this.isUseLayerColor) {
                    this.updateElementColor(g);
                }
                const imgBBox = img.getBBox();
                const angle = svgedit.utilities.getRotationAngle(img);
                let cmd = this.deleteSelectedElements();
                batchCmd.addSubCommand(cmd);
                this.selectOnly([g], true);
                let gBBox = g.getBBox();
                if (imgBBox.width !== gBBox.width) {
                    this.setSvgElemSize('width', imgBBox.width);
                }
                if (imgBBox.height !== gBBox.height) {
                    this.setSvgElemSize('height', imgBBox.height);
                }
                gBBox = g.getBBox();
                dx = (imgBBox.x + 0.5  * imgBBox.width) - (gBBox.x + 0.5  * gBBox.width);
                dy = (imgBBox.y + 0.5  * imgBBox.height) - (gBBox.y + 0.5  * gBBox.height);
                this.moveElements([dx], [dy], [g], false);
                this.setRotationAngle(angle, true, g);
                g.childNodes.forEach(child => {
                    $(child).attr('id', getNextId());
                    $(child).attr('vector-effect', "non-scaling-stroke");
                })
                selectorManager.requestSelector(g).resize();
                
                addCommandToHistory(batchCmd);
            });
        }

        // Group: Element manipulation

        // Function: setSegType
        // Sets the new segment type to the selected segment(s).
        //
        // Parameters:
        // new_type - Integer with the new segment type
        // See http://www.w3.org/TR/SVG/paths.html#InterfaceSVGPathSeg for list
        this.setSegType = function (new_type) {
            pathActions.setSegType(new_type);
        };

        // TODO(codedread): Remove the getBBox argument and split this function into two.
        // Function: convertToPath
        // Convert selected element to a path, or get the BBox of an element-as-path
        //
        // Parameters:
        // elem - The DOM element to be converted
        // getBBox - Boolean on whether or not to only return the path's BBox
        //
        // Returns:
        // If the getBBox flag is true, the resulting path's bounding box object.
        // Otherwise the resulting path element is returned.
        this.convertToPath = function (elem, getBBox) {
            if (elem == null) {
                var elems = selectedElements;
                $.each(elems, function (i, elem) {
                    if (elem) {
                        canvas.convertToPath(elem);
                    }
                });
                return;
            }
            if (getBBox) {
                return svgedit.utilities.getBBoxOfElementAsPath(elem, addSvgElementFromJson, pathActions);
            } else {
                // TODO: Why is this applying attributes from cur_shape, then inside utilities.convertToPath it's pulling addition attributes from elem?
                // TODO: If convertToPath is called with one elem, cur_shape and elem are probably the same; but calling with multiple is a bug or cool feature.
                var attrs = {
                    'fill': cur_shape.fill,
                    'fill-opacity': cur_shape.fill_opacity,
                    'stroke': cur_shape.stroke,
                    'stroke-width': cur_shape.stroke_width,
                    'stroke-dasharray': cur_shape.stroke_dasharray,
                    'stroke-linejoin': cur_shape.stroke_linejoin,
                    'stroke-linecap': cur_shape.stroke_linecap,
                    'stroke-opacity': cur_shape.stroke_opacity,
                    'opacity': cur_shape.opacity,
                    'visibility': 'hidden'
                };
                return svgedit.utilities.convertToPath(elem, attrs, addSvgElementFromJson, pathActions, clearSelection, addToSelection, svgedit.history, addCommandToHistory);
            }
        };


        // Function: changeSelectedAttributeNoUndo
        // This function makes the changes to the elements. It does not add the change
        // to the history stack.
        //
        // Parameters:
        // attr - String with the attribute name
        // newValue - String or number with the new attribute value
        // elems - The DOM elements to apply the change to
        var changeSelectedAttributeNoUndo = function (attr, newValue, elems) {
            if (current_mode === 'pathedit') {
                // Editing node
                pathActions.moveNode(attr, newValue);
            }
            elems = elems || selectedElements;
            var i = elems.length;
            var no_xy_elems = ['g', 'polyline', 'path', 'polygon'];
            var good_g_attrs = ['transform', 'opacity', 'filter'];

            while (i--) {
                var elem = elems[i];
                if (elem == null) {
                    continue;
                }

                // Set x,y vals on elements that don't have them
                if ((attr === 'x' || attr === 'y') && no_xy_elems.indexOf(elem.tagName) >= 0) {
                    var bbox = getStrokedBBox([elem]);
                    var diff_x = attr === 'x' ? newValue - bbox.x : 0;
                    var diff_y = attr === 'y' ? newValue - bbox.y : 0;
                    canvas.moveSelectedElements(diff_x * current_zoom, diff_y * current_zoom, true);
                    continue;
                }

                // only allow the transform/opacity/filter attribute to change on <g> elements, slightly hacky
                // TODO: FIXME: This doesn't seem right. Where's the body of this if statement?
                if (elem.tagName === 'g' && good_g_attrs.indexOf(attr) >= 0) {}
                var oldval = attr === '#text' ? elem.textContent : elem.getAttribute(attr);
                if (oldval == null) {
                    oldval = '';
                }
                if (oldval !== String(newValue)) {
                    if (attr === '#text') {
                        var old_w = svgedit.utilities.getBBox(elem).width;
                        elem.textContent = newValue;

                        // FF bug occurs on on rotated elements
                        if (/rotate/.test(elem.getAttribute('transform'))) {
                            elem = ffClone(elem);
                        }

                        // Hoped to solve the issue of moving text with text-anchor="start",
                        // but this doesn't actually fix it. Hopefully on the right track, though. -Fyrd

                        //					var box=getBBox(elem), left=box.x, top=box.y, width=box.width,
                        //						height=box.height, dx = width - old_w, dy=0;
                        //					var angle = svgedit.utilities.getRotationAngle(elem, true);
                        //					if (angle) {
                        //						var r = Math.sqrt( dx*dx + dy*dy );
                        //						var theta = Math.atan2(dy,dx) - angle;
                        //						dx = r * Math.cos(theta);
                        //						dy = r * Math.sin(theta);
                        //
                        //						elem.setAttribute('x', elem.getAttribute('x')-dx);
                        //						elem.setAttribute('y', elem.getAttribute('y')-dy);
                        //					}

                    } else if (attr === '#href') {
                        setHref(elem, newValue);
                    } else {
                        elem.setAttribute(attr, newValue);
                    }

                    // Go into "select" mode for text changes
                    // NOTE: Important that this happens AFTER elem.setAttribute() or else attributes like
                    // font-size can get reset to their old value, ultimately by svgEditor.updateContextPanel(),
                    // after calling textActions.toSelectMode() below
                    if (current_mode === 'textedit' && attr !== '#text' && elem.textContent.length) {
                        textActions.toSelectMode(elem);
                    }

                    //			if (i==0)
                    //				selectedBBoxes[0] = svgedit.utilities.getBBox(elem);
                    // Use the Firefox ffClone hack for text elements with gradients or
                    // where other text attributes are changed.
                    if (svgedit.browser.isGecko() && elem.nodeName === 'text' && /rotate/.test(elem.getAttribute('transform'))) {
                        if (String(newValue).indexOf('url') === 0 || (['font-size', 'font-family', 'x', 'y'].indexOf(attr) >= 0 && elem.textContent)) {
                            elem = ffClone(elem);
                        }
                    }
                    // Timeout needed for Opera & Firefox
                    // codedread: it is now possible for this function to be called with elements
                    // that are not in the selectedElements array, we need to only request a
                    // selector if the element is in that array
                    if (selectedElements.indexOf(elem) >= 0) {
                        setTimeout(() => {
                            // Due to element replacement, this element may no longer
                            // be part of the DOM
                            if (!elem.parentNode) {
                                return;
                            }
                            selectorManager.requestSelector(elem).resize();
                        }, 0);
                    }
                    // if this element was rotated, and we changed the position of this element
                    // we need to update the rotational transform attribute
                    var angle = svgedit.utilities.getRotationAngle(elem);
                    if (angle != 0 && attr !== 'transform') {
                        var tlist = svgedit.transformlist.getTransformList(elem);
                        var n = tlist.numberOfItems;
                        while (n--) {
                            var xform = tlist.getItem(n);
                            if (xform.type == 4) {
                                // remove old rotate
                                tlist.removeItem(n);

                                var box = svgedit.utilities.getBBox(elem);
                                var center = svgedit.math.transformPoint(box.x + box.width / 2, box.y + box.height / 2, svgedit.math.transformListToTransform(tlist).matrix);
                                var cx = center.x,
                                    cy = center.y;
                                var newrot = svgroot.createSVGTransform();
                                newrot.setRotate(angle, cx, cy);
                                tlist.insertItemBefore(newrot, n);
                                break;
                            }
                        }
                    }
                } // if oldValue != newValue
            } // for each elem
        };

        // Function: changeSelectedAttribute
        // Change the given/selected element and add the original value to the history stack
        // If you want to change all selectedElements, ignore the elems argument.
        // If you want to change only a subset of selectedElements, then send the
        // subset to this function in the elems argument.
        //
        // Parameters:
        // attr - String with the attribute name
        // newValue - String or number with the new attribute value
        // elems - The DOM elements to apply the change to
        var changeSelectedAttribute = this.changeSelectedAttribute = function (attr, val, elems) {
            elems = elems || selectedElements;
            canvas.undoMgr.beginUndoableChange(attr, elems);
            var i = elems.length;

            changeSelectedAttributeNoUndo(attr, val, elems);

            var batchCmd = canvas.undoMgr.finishUndoableChange();
            if (!batchCmd.isEmpty()) {
                addCommandToHistory(batchCmd);
            }
        };

        // Function: deleteSelectedElements
        // Removes all selected elements from the DOM and adds the change to the
        // history stack
        this.deleteSelectedElements = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var i;
            var batchCmd = new svgedit.history.BatchCommand('Delete Elements');
            var len = selectedElements.length;
            var selectedCopy = []; //selectedElements is being deleted
            for (i = 0; i < len; ++i) {
                var selected = selectedElements[i];
                if (selected == null) {
                    break;
                }

                var parent = selected.parentNode;
                var t = selected;

                // this will unselect the element and remove the selectedOutline
                selectorManager.releaseSelector(t);

                // Remove the path if present.
                svgedit.path.removePath_(t.id);

                // Get the parent if it's a single-child anchor
                if (parent.tagName === 'a' && parent.childNodes.length === 1) {
                    t = parent;
                    parent = parent.parentNode;
                }

                var nextSibling = t.nextSibling;
                if (parent == null) {
                    console.log("The element has no parent", elem);
                } else {
                    var elem = parent.removeChild(t);
                    selectedCopy.push(selected); //for the copy
                    selectedElements[i] = null;
                    batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent));
                }
            }
            if (!batchCmd.isEmpty()) {
                addCommandToHistory(batchCmd);
            }
            call('changed', selectedCopy);
            clearSelection();

            return batchCmd;
        };

        // Function: cutSelectedElements
        // Removes all selected elements from the DOM and adds the change to the
        // history stack. Remembers removed elements on the clipboard

        // TODO: Combine similar code with deleteSelectedElements
        this.cutSelectedElements = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var i;
            var batchCmd = new svgedit.history.BatchCommand('Cut Elements');
            var len = selectedElements.length;
            var selectedCopy = []; //selectedElements is being deleted
            var layerDict = {}, layerCount = 0;

            for (i = 0; i < len && selectedElements[i]; ++i) {
                var selected = selectedElements[i],
                    selectedRef = selectedElements[i];

                var layerName = $(selected.parentNode).find('title').text();
                selected.setAttribute("data-origin-layer", layerName);
                if (!layerDict[layerName]) {
                    layerDict[layerName] = true;
                    layerCount++;
                }

                // this will unselect the element and remove the selectedOutline
                selectorManager.releaseSelector(selectedRef);

                // Remove the path if present.
                svgedit.path.removePath_(selectedRef.id);

                var nextSibling = selectedRef.nextSibling;
                var parent = selectedRef.parentNode;
                var elem = parent.removeChild(selectedRef);
                selectedCopy.push(selected); //for the copy
                selectedElements[i] = null;
                batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent));
            }

            // If there is only one layer selected, don't force user to paste on the same layer
            if (layerCount == 1) {
                for(i = 0; i < selectedCopy.length; i++) {
                    selectedCopy[i].removeAttribute("data-origin-layer");
                }
            }

            if (!batchCmd.isEmpty()) {
                addCommandToHistory(batchCmd);
            }
            call('changed', selectedCopy);
            clearSelection();

            canvas.clipBoard = selectedCopy;
        };

        // Function: copySelectedElements
        // Remembers the current selected elements on the clipboard
        this.copySelectedElements = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var layerDict = {}, layerCount = 0;

            for (var i = 0; i < selectedElements.length && selectedElements[i]; ++i) {
                var selected = selectedElements[i],
                    layerName = $(selected.parentNode).find('title').text();
                selected.setAttribute("data-origin-layer", layerName);
                if (!layerDict[layerName]) {
                    layerDict[layerName] = true;
                    layerCount++;
                }
            }

            // If there is only one layer selected, don't force user to paste on the same layer
            if (layerCount == 1) {
                for(i = 0; i < selectedElements.length; i++) {
                    if (selectedElements[i]) {
                        selectedElements[i].removeAttribute("data-origin-layer");
                    }
                }
            }

            canvas.clipBoard = $.merge([], selectedElements);
        };

        this.pasteElements = function (type, x, y) {
            var cb = canvas.clipBoard;
            var len = cb.length;
            if (!len) {
                return;
            }

            var pasted = [];
            var batchCmd = new svgedit.history.BatchCommand('Paste elements');
            var drawing = getCurrentDrawing();

            // Move elements to lastClickPoint
            while (len--) {
                var elem = cb[len];
                if (!elem) {
                    continue;
                }
                var copy = drawing.copyElem(elem);

                // See if elem with elem ID is in the DOM already
                if (!svgedit.utilities.getElem(elem.id)) {
                    copy.id = elem.id;
                }

                pasted.push(copy);
                if (copy.getAttribute("data-origin-layer") && cb.length > 1) {
                    var layer = drawing.getLayerByName(copy.getAttribute("data-origin-layer")) || (current_group || drawing.getCurrentLayer());
                    layer.appendChild(copy);
                } else {
                    (current_group || drawing.getCurrentLayer()).appendChild(copy);
                }
                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(copy));

                restoreRefElems(copy);
            }

            selectOnly(pasted);

            if (type !== 'in_place') {

                var ctr_x, ctr_y;

                if (!type) {
                    ctr_x = lastClickPoint.x;
                    ctr_y = lastClickPoint.y;
                } else if (type === 'point') {
                    ctr_x = x;
                    ctr_y = y;
                }

                var bbox = getStrokedBBox(pasted);
                var cx = ctr_x - (bbox.x + bbox.width / 2),
                    cy = ctr_y - (bbox.y + bbox.height / 2),
                    dx = [],
                    dy = [];

                $.each(pasted, function (i, item) {
                    dx.push(cx);
                    dy.push(cy);
                });

                var cmd = canvas.moveSelectedElements(dx, dy, false);
                batchCmd.addSubCommand(cmd);
            }

            addCommandToHistory(batchCmd);
            call('changed', pasted);
        };

        // Function: getLatestImportFileName
        // Get latest imported file name
        this.setLatestImportFileName = function(fileName) {
            this.latestImportFileName = fileName;
            this.currentFileName = fileName;
            $('#svgcanvas').trigger('mouseup'); //update file title
        }

        // Function: getLatestImportFileName
        // Get latest imported file name
        this.getLatestImportFileName = function() {
            return this.latestImportFileName;
        }

        // Function: groupSelectedElements
        // Wraps all the selected elements in a group (g) element

        // Parameters:
        // type - type of element to group into, defaults to <g>
        this.groupSelectedElements = function (type, urlArg) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            if (!type) {
                type = 'g';
            }
            var cmd_str = '';

            switch (type) {
                case 'a':
                    cmd_str = 'Make hyperlink';
                    var url = '';
                    if (arguments.length > 1) {
                        url = urlArg;
                    }
                    break;
                default:
                    type = 'g';
                    cmd_str = 'Group Elements';
                    break;
            }

            var batchCmd = new svgedit.history.BatchCommand(cmd_str);

            // create and insert the group element
            var g = addSvgElementFromJson({
                'element': type,
                'attr': {
                    'id': getNextId()
                }
            });
            if (type === 'a') {
                setHref(g, url);
            }
            batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));

            // now move all children into the group
            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                if (elem == null) {
                    continue;
                }

                if (elem.parentNode.tagName === 'a' && elem.parentNode.childNodes.length === 1) {
                    elem = elem.parentNode;
                }

                const original_layer = this.getObjectLayer(elem).title;
                $(elem).attr('data-original-layer', original_layer);

                var oldNextSibling = elem.nextSibling;
                var oldParent = elem.parentNode;
                g.appendChild(elem);
                batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldParent));
            }
            if (!batchCmd.isEmpty()) {
                addCommandToHistory(batchCmd);
            }

            if (canvas.isUseLayerColor) {
                canvas.updateElementColor(g);
            }

            // update selection
            selectOnly([g], true);
        };


        // Function: pushGroupProperties
        // Pushes all appropriate parent group properties down to its children, then
        // removes them from the group
        var pushGroupProperties = this.pushGroupProperties = function (g, undoable) {

            var children = g.childNodes;
            var len = children.length;
            var xform = g.getAttribute('transform');

            var glist = svgedit.transformlist.getTransformList(g);
            var m = svgedit.math.transformListToTransform(glist).matrix;

            var batchCmd = new svgedit.history.BatchCommand('Push group properties');

            // TODO: get all fill/stroke properties from the group that we are about to destroy
            // "fill", "fill-opacity", "fill-rule", "stroke", "stroke-dasharray", "stroke-dashoffset",
            // "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
            // "stroke-width"
            // and then for each child, if they do not have the attribute (or the value is 'inherit')
            // then set the child's attribute

            var i = 0;
            var gangle = svgedit.utilities.getRotationAngle(g);

            var gattrs = $(g).attr(['filter', 'opacity']);
            var gfilter, gblur, changes;
            var drawing = getCurrentDrawing();

            for (i = 0; i < len; i++) {
                var elem = children[i];

                if (elem.nodeType !== 1) {
                    continue;
                }

                if (gattrs.opacity !== null && gattrs.opacity !== 1) {
                    var c_opac = elem.getAttribute('opacity') || 1;
                    var new_opac = Math.round((elem.getAttribute('opacity') || 1) * gattrs.opacity * 100) / 100;
                    changeSelectedAttribute('opacity', new_opac, [elem]);
                }

                if (gattrs.filter) {
                    var cblur = this.getBlur(elem);
                    var orig_cblur = cblur;
                    if (!gblur) {
                        gblur = this.getBlur(g);
                    }
                    if (cblur) {
                        // Is this formula correct?
                        cblur = Number(gblur) + Number(cblur);
                    } else if (cblur === 0) {
                        cblur = gblur;
                    }

                    // If child has no current filter, get group's filter or clone it.
                    if (!orig_cblur) {
                        // Set group's filter to use first child's ID
                        if (!gfilter) {
                            gfilter = svgedit.utilities.getRefElem(gattrs.filter);
                        } else {
                            // Clone the group's filter
                            gfilter = drawing.copyElem(gfilter);
                            svgedit.utilities.findDefs().appendChild(gfilter);
                        }
                    } else {
                        gfilter = svgedit.utilities.getRefElem(elem.getAttribute('filter'));
                    }

                    // Change this in future for different filters
                    var suffix = (gfilter.firstChild.tagName === 'feGaussianBlur') ? 'blur' : 'filter';
                    gfilter.id = elem.id + '_' + suffix;
                    changeSelectedAttribute('filter', 'url(#' + gfilter.id + ')', [elem]);

                    // Update blur value
                    if (cblur) {
                        changeSelectedAttribute('stdDeviation', cblur, [gfilter.firstChild]);
                        canvas.setBlurOffsets(gfilter, cblur);
                    }
                }

                var chtlist = svgedit.transformlist.getTransformList(elem);

                // Don't process gradient transforms
                if (~elem.tagName.indexOf('Gradient')) {
                    chtlist = null;
                }

                // Hopefully not a problem to add this. Necessary for elements like <desc/>
                if (!chtlist) {
                    continue;
                }

                // Apparently <defs> can get get a transformlist, but we don't want it to have one!
                if (elem.tagName === 'defs') {
                    continue;
                }

                if (glist.numberOfItems) {
                    // TODO: if the group's transform is just a rotate, we can always transfer the
                    // rotate() down to the children (collapsing consecutive rotates and factoring
                    // out any translates)
                    if (gangle && glist.numberOfItems === 1) {
                        // [Rg] [Rc] [Mc]
                        // we want [Tr] [Rc2] [Mc] where:
                        //	- [Rc2] is at the child's current center but has the
                        // sum of the group and child's rotation angles
                        //	- [Tr] is the equivalent translation that this child
                        // undergoes if the group wasn't there

                        // [Tr] = [Rg] [Rc] [Rc2_inv]

                        // get group's rotation matrix (Rg)
                        var rgm = glist.getItem(0).matrix;

                        // get child's rotation matrix (Rc)
                        var rcm = svgroot.createSVGMatrix();
                        var cangle = svgedit.utilities.getRotationAngle(elem);
                        if (cangle) {
                            rcm = chtlist.getItem(0).matrix;
                        }

                        // get child's old center of rotation
                        var cbox = svgedit.utilities.getBBox(elem);
                        var ceqm = svgedit.math.transformListToTransform(chtlist).matrix;
                        var coldc = svgedit.math.transformPoint(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2, ceqm);

                        // sum group and child's angles
                        var sangle = gangle + cangle;

                        // get child's rotation at the old center (Rc2_inv)
                        var r2 = svgroot.createSVGTransform();
                        r2.setRotate(sangle, coldc.x, coldc.y);

                        // calculate equivalent translate
                        var trm = svgedit.math.matrixMultiply(rgm, rcm, r2.matrix.inverse());

                        // set up tlist
                        if (cangle) {
                            chtlist.removeItem(0);
                        }

                        if (sangle) {
                            if (chtlist.numberOfItems) {
                                chtlist.insertItemBefore(r2, 0);
                            } else {
                                chtlist.appendItem(r2);
                            }
                        }

                        if (trm.e || trm.f) {
                            var tr = svgroot.createSVGTransform();
                            tr.setTranslate(trm.e, trm.f);
                            if (chtlist.numberOfItems) {
                                chtlist.insertItemBefore(tr, 0);
                            } else {
                                chtlist.appendItem(tr);
                            }
                        }
                    } else { // more complicated than just a rotate

                        // transfer the group's transform down to each child and then
                        // call svgedit.recalculate.recalculateDimensions()
                        var oldxform = elem.getAttribute('transform');
                        changes = {};
                        changes.transform = oldxform || '';

                        var newxform = svgroot.createSVGTransform();

                        // [ gm ] [ chm ] = [ chm ] [ gm' ]
                        // [ gm' ] = [ chm_inv ] [ gm ] [ chm ]
                        var chm = svgedit.math.transformListToTransform(chtlist).matrix,
                            chm_inv = chm.inverse();
                        var gm = svgedit.math.matrixMultiply(chm_inv, m, chm);
                        newxform.setMatrix(gm);
                        chtlist.appendItem(newxform);
                    }
                    var cmd = svgedit.recalculate.recalculateDimensions(elem);
                    if (cmd) {
                        batchCmd.addSubCommand(cmd);
                    }
                }
            }


            // remove transform and make it undo-able
            if (xform) {
                changes = {};
                changes.transform = xform;
                g.setAttribute('transform', '');
                g.removeAttribute('transform');
                batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(g, changes));
            }

            if (undoable && !batchCmd.isEmpty()) {
                return batchCmd;
            }
        };

        this.disassembleUse2Group = function(elems = null) {
            if (!elems) {
                elems = selectedElements;
            }
            for (let i = 0; i < elems.length; ++i) {
                elem = elems[i];
                if (!elem || elem.tagName !== 'use') {
                    continue;
                }

                const layer = this.getObjectLayer(elem).elem;
                const color = this.isUseLayerColor ? $(layer).data('color') : '#333';

                const wireframe = $(elem).data('wireframe');
                let transform = $(elem).attr('transform') || '';
                const translate = `translate(${$(elem).attr('x') || 0},${$(elem).attr('y') || 0})`
                transform = `${transform} ${translate}`;
                const href = this.getHref(elem);
                const svg = $(href).toArray()[0];
                let children = [...Array.from($(svg)[0].childNodes).reverse()];
                let g = addSvgElementFromJson({
                    'element': 'g',
                    'attr': {
                        'id': getNextId(),
                        'transform': transform,
                    }   
                });
                while (children.length > 0) {
                    topChild = children.pop();
                    if (topChild.tagName !== 'defs') {
                        g.appendChild(topChild);
                    }
                }
                // apply style
                let ascendents = [...g.childNodes];
                while (ascendents.length > 0) {
                    const topChild = ascendents.pop();
                    if (topChild.tagName === 'g') {
                        ascendents.push(...topChild.childNodes);
                    } else {
                        if (wireframe) {
                            $(topChild).attr('stroke', color);
                            $(topChild).attr('fill-opacity', 0);
                            $(topChild).attr('fill', '#FFF');
                        }
                    }
                    $(topChild).attr('vector-effect', 'non-scaling-stroke');
                    $(topChild).attr('id', getNextId())
                }
                //svg.parentNode.removeChild(svg);
                elem.parentNode.removeChild(elem);
                selectOnly([g], true);
            }
        }

        // Function: ungroupSelectedElement
        // Unwraps all the elements in a selected group (g) element. This requires
        // significant recalculations to apply group's transforms, etc to its children
        this.ungroupSelectedElement = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var g = selectedElements[0];
            if (!g) {
                return;
            }

            if (g.tagName === 'use') {
                this.disassembleUse2Group([g]);
                return;
            }
            if ($(g).data('gsvg') || $(g).data('symbol')) {
                // Is svg, so actually convert to group
                convertToGroup(g);
                return;
            } 
            var parents_a = $(g).parents('a');
            if (parents_a.length) {
                g = parents_a[0];
            }

            // Look for parent "a"
            if (g.tagName === 'g' || g.tagName === 'a') {

                var batchCmd = new svgedit.history.BatchCommand('Ungroup Elements');
                var cmd = pushGroupProperties(g, true);
                if (cmd) {
                    batchCmd.addSubCommand(cmd);
                }

                var parent = g.parentNode;
                var anchor = g.nextSibling;
                var children = new Array(g.childNodes.length);

                var i = 0;

                while (g.firstChild) {
                    var elem = g.firstChild;
                    var oldNextSibling = elem.nextSibling;
                    var oldParent = elem.parentNode;

                    // Remove child title elements
                    if (elem.tagName === 'title') {
                        var nextSibling = elem.nextSibling;
                        batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(elem, nextSibling, oldParent));
                        oldParent.removeChild(elem);
                        continue;
                    }

                    const original_layer = getCurrentDrawing().getLayerByName($(elem).data('original-layer'));
                    if (original_layer) {
                        original_layer.appendChild(elem);
                        if (this.isUseLayerColor) {
                            this.updateElementColor(elem);
                        }
                    } else {
                        elem = parent.insertBefore(elem, anchor);
                    }
                    children[i++] = elem;
                    batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldParent));
                }

                // remove the group from the selection
                clearSelection();

                // delete the group element (but make undo-able)
                var gNextSibling = g.nextSibling;
                g = parent.removeChild(g);
                batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(g, gNextSibling, parent));

                if (!batchCmd.isEmpty()) {
                    addCommandToHistory(batchCmd);
                }

                // update selection
                addToSelection(children);
            }
        };

        this.tempGroupSelectedElements = function () {
            const type = 'g';

            // create and insert the group element
            let g = addSvgElementFromJson({
                'element': type,
                'attr': {
                    'id': getNextId(),
                    'data-tempgroup': true
                }
            });

            // now move all children into the group
            var i = selectedElements.length;
            while (i--) {
                var elem = selectedElements[i];
                if (elem == null) {
                    continue;
                }

                if (elem.parentNode.tagName === 'a' && elem.parentNode.childNodes.length === 1) {
                    elem = elem.parentNode;
                }
                const original_layer = this.getObjectLayer(elem).title;
                $(elem).attr('data-original-layer', original_layer);

                g.appendChild(elem);
            }

            // update selection
            selectOnly([g], true);
        };

        // Function: ungroupTempGroup
        // Unwraps all the elements in a selected group (g) element. This requires
        // significant recalculations to apply group's transforms, etc to its children
        this.ungroupTempGroup = function () {

            var g = selectedElements[0];
            if (!g) {
                return;
            }
            if ($(g).data('gsvg') || $(g).data('symbol')) {
                // Is svg, so actually convert to group
                convertToGroup(g);
                return;
            }
            if (g.tagName === 'use') {
                // Somehow doesn't have data set, so retrieve
                var symbol = svgedit.utilities.getElem(getHref(g).substr(1));
                $(g).data('symbol', symbol).data('ref', symbol);
                convertToGroup(g);
                return;
            }
            var parents_a = $(g).parents('a');
            if (parents_a.length) {
                g = parents_a[0];
            }

            // Look for parent "a"
            if (g.tagName === 'g' || g.tagName === 'a') {

                let batchCmd = new svgedit.history.BatchCommand('Ungroup Temp Group');
                let cmd = pushGroupProperties(g, true);
                if (cmd) {
                    batchCmd.addSubCommand(cmd);
                }
                var parent = g.parentNode;
                var anchor = g.nextSibling;
                var children = new Array(g.childNodes.length);

                var i = 0;

                while (g.firstChild) {
                    var elem = g.firstChild;
                    var oldNextSibling = elem.nextSibling;
                    var oldParent = elem.parentNode;

                    // Remove child title elements
                    if (elem.tagName === 'title') {
                        var nextSibling = elem.nextSibling;
                        oldParent.removeChild(elem);
                        continue;
                    }
                    
                    const original_layer = getCurrentDrawing().getLayerByName($(elem).data('original-layer'));
                    if (original_layer) {
                        original_layer.appendChild(elem);
                        if (this.isUseLayerColor) {
                            this.updateElementColor(elem);
                        }
                    } else {
                        elem = parent.insertBefore(elem, anchor);
                    }
                    children[i++] = elem;
                }

                if (!batchCmd.isEmpty()) {
                    addCommandToHistory(batchCmd);
                }

                tempGroup = false;
                // remove the group from the selection
                clearSelection();
                g = parent.removeChild(g);
            }
            return children;
        };

        this.getTempGroup = () => {
            return tempGroup;
        }

        this.gridArraySelectedElement = (gridDistanceXY, arrayNumberXY) => {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }

            const originElements = selectedElements;
            if (originElements.length == 0) {
                return;
            }
            let pastedElements = [];
            let dx = [];
            let dy = [];
            let batchCmd = new svgedit.history.BatchCommand('Grid elements');
            var drawing = getCurrentDrawing();
            let elementCount = 0;
            for (let i = 0; i < originElements.length; ++i) {
                const elem = originElements[i];
                if (!elem) {
                    break;
                }
                for (let j = 0; j < arrayNumberXY.column; ++j) {
                    for (let k = 0; k < arrayNumberXY.row; ++k) {

                        dx[elementCount] = j * gridDistanceXY.dx;
                        dy[elementCount] = k * gridDistanceXY.dy;
                        elementCount += 1;

                        if (j == 0 && k == 0) continue;
                        const copy = drawing.copyElem(elem);
                        if (!svgedit.utilities.getElem(elem.id)) {
                            copy.id = elem.id;
                        }
                        const layerName = $(elem.parentNode).find('title').text();
                        const layer = drawing.getLayerByName(layerName);
                        layer.appendChild(copy);
                        batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(copy));
                        restoreRefElems(copy);
                        pastedElements.push(copy);
                    }
                }
            }
            addToSelection(pastedElements);
            const cmd = canvas.moveSelectedElements(dx, dy, false);
            batchCmd.addSubCommand(cmd);
            canvas.undoMgr.undoStackPointer -= 1;
            canvas.undoMgr.undoStack.pop();
            addCommandToHistory(batchCmd);
            if (pastedElements.length > 0) {
                call('changed', pastedElements);
            }
        }

        // Function: offsetElements
        // Create offset of elements
        // dir: direction 0: inward 1: outward; dist: offset distance; cornerType: cornerType; elem: target, selected if not passed;
        this.offsetElements = (dir, dist, cornerType, elems) => {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            elems = elems || selectedElements;
            let batchCmd = new svgedit.history.BatchCommand('Create Offset Elements');
            let solution_paths = [];
            const scale = 100;

            if (dir === 0) {
                dist *= -1
            }; 
            let newElem;
            let isContainNotSupportTag = false;
            let co = new svgedit.ClipperLib.ClipperOffset(2 , 0.25);
            elems.forEach(elem => {
                if (!elem) {
                    return;
                }
                if (['g', 'use', 'image', 'text'].indexOf(elem.tagName) >= 0) {
                    isContainNotSupportTag = true;
                    console.log(elem.tagName);
                    return;
                }
                const dpath = svgedit.utilities.getPathDFromElement(elem);
                const bbox = svgedit.utilities.getBBox(elem);
                let rotation = {
                    angle: svgedit.utilities.getRotationAngle(elem),
                    cx: bbox.x + bbox.width / 2,
                    cy: bbox.y + bbox.height / 2
                };

                const paths = svgedit.ClipperLib.dPathtoPointPathsAndScale(dpath, rotation, scale);
                let closed = true;
                for (let j = 0; j < paths.length; ++j) {
                    if (!(paths[j][0].X === paths[j][paths[j].length - 1].X && paths[j][0].Y === paths[j][paths[j].length - 1].Y)) {
                        closed = false;
                        break;
                    }
                }
                if (cornerType === 'round') {
                    co.AddPaths(paths, svgedit.ClipperLib.JoinType.jtRound, svgedit.ClipperLib.EndType.etOpenRound);
                } else if (cornerType === 'sharp') {
                    if (closed) {
                        co.AddPaths(paths, svgedit.ClipperLib.JoinType.jtMiter, svgedit.ClipperLib.EndType.etClosedLine);
                    } else {
                        co.AddPaths(paths, svgedit.ClipperLib.JoinType.jtMiter, svgedit.ClipperLib.EndType.etOpenSquare);
                    }
                }
            });
            co.Execute(solution_paths, Math.abs(dist * scale));
            solution_paths = (dir === 1) ? [solution_paths[0]] : solution_paths.slice(1);
            if (solution_paths.length === 0 || !solution_paths[0]) {
                if (isContainNotSupportTag) {
                    AlertActions.showPopupWarning('Offset', LANG.tool_panels._offset.not_support_message)
                } else {
                    AlertActions.showPopupError('Offset', LANG.tool_panels._offset.fail_message);
                }
                console.log('clipper.co failed');
                return;
            }
            if (isContainNotSupportTag) {
                AlertActions.showPopupWarning('Offset', LANG.tool_panels._offset.not_support_message)
            }
            let d = '';
            for (let i = 0; i < solution_paths.length; ++i) {
                d += 'M';
                d += solution_paths[i].map(x => `${x.X / scale},${x.Y / scale}`).join(' L');
                d += ' Z'
            }
            newElem = addSvgElementFromJson({
                element: 'path',
                curStyles: false,
                attr: {
                    id: getNextId(),
                    d: d,
                    stroke: '#000',
                    'fill-opacity': 0,
                    opacity: cur_shape.opacity
                }
            });
            batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(newElem));
            if (this.isUseLayerColor) {
                this.updateElementColor(newElem);
            }

            selectOnly([newElem], true);
            addCommandToHistory(batchCmd);
        }

        // Function: moveToTopSelectedElement
        // Repositions the selected element to the bottom in the DOM to appear on top of
        // other elements
        this.moveToTopSelectedElement = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var selected = selectedElements[0];
            if (selected != null) {
                var t = selected;
                var oldParent = t.parentNode;
                var oldNextSibling = t.nextSibling;
                t = t.parentNode.appendChild(t);
                // If the element actually moved position, add the command and fire the changed
                // event handler.
                if (oldNextSibling !== t.nextSibling) {
                    addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'top'));
                    call('changed', [t]);
                }
            }
        };

        // Function: moveToBottomSelectedElement
        // Repositions the selected element to the top in the DOM to appear under
        // other elements
        this.moveToBottomSelectedElement = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var selected = selectedElements[0];
            if (selected != null) {
                var t = selected;
                var oldParent = t.parentNode;
                var oldNextSibling = t.nextSibling;
                var firstChild = t.parentNode.firstChild;
                if (firstChild.tagName === 'title') {
                    firstChild = firstChild.nextSibling;
                }
                // This can probably be removed, as the defs should not ever apppear
                // inside a layer group
                if (firstChild.tagName === 'defs') {
                    firstChild = firstChild.nextSibling;
                }
                t = t.parentNode.insertBefore(t, firstChild);
                // If the element actually moved position, add the command and fire the changed
                // event handler.
                if (oldNextSibling !== t.nextSibling) {
                    addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'bottom'));
                    call('changed', [t]);
                }
            }
        };

        // Function: moveUpDownSelected
        // Moves the select element up or down the stack, based on the visibly
        // intersecting elements
        //
        // Parameters:
        // dir - String that's either 'Up' or 'Down'
        this.moveUpDownSelected = function (dir) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var selected = selectedElements[0];
            if (!selected) {
                return;
            }

            curBBoxes = [];
            var closest, found_cur;
            // jQuery sorts this list
            var list = $(getIntersectionList(getStrokedBBox([selected]))).toArray();
            if (dir === 'Down') {
                list.reverse();
            }

            $.each(list, function () {
                if (!found_cur) {
                    if (this === selected) {
                        found_cur = true;
                    }
                    return;
                }
                closest = this;
                return false;
            });
            if (!closest) {
                return;
            }

            var t = selected;
            var oldParent = t.parentNode;
            var oldNextSibling = t.nextSibling;
            $(closest)[dir === 'Down' ? 'before' : 'after'](t);
            // If the element actually moved position, add the command and fire the changed
            // event handler.
            if (oldNextSibling != t.nextSibling) {
                addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'Move ' + dir));
                call('changed', [t]);
            }
        };

        // Function: moveSelectedElements
        // Moves selected elements on the X/Y axis
        //
        // Parameters:
        // dx - Float with the distance to move on the x-axis
        // dy - Float with the distance to move on the y-axis
        // undoable - Boolean indicating whether or not the action should be undoable
        //
        // Returns:
        // Batch command for the move
        this.moveSelectedElements = function (dx, dy, undoable) {
            // if undoable is not sent, default to true
            // if single values, scale them to the zoom
            if (dx.constructor != Array) {
                dx /= current_zoom;
                dy /= current_zoom;
            }
            undoable = undoable || true;
            var batchCmd = new svgedit.history.BatchCommand('position');
            var i = selectedElements.length;
            while (i--) {
                var selected = selectedElements[i];
                if (selected != null) {
                    //			if (i==0)
                    //				selectedBBoxes[0] = svgedit.utilities.getBBox(selected);

                    //			var b = {};
                    //			for (var j in selectedBBoxes[i]) b[j] = selectedBBoxes[i][j];
                    //			selectedBBoxes[i] = b;

                    var xform = svgroot.createSVGTransform();
                    var tlist = svgedit.transformlist.getTransformList(selected);

                    // dx and dy could be arrays
                    if (dx.constructor == Array) {
                        //				if (i==0) {
                        //					selectedBBoxes[0].x += dx[0];
                        //					selectedBBoxes[0].y += dy[0];
                        //				}
                        xform.setTranslate(dx[i], dy[i]);
                    } else {
                        //				if (i==0) {
                        //					selectedBBoxes[0].x += dx;
                        //					selectedBBoxes[0].y += dy;
                        //				}
                        xform.setTranslate(dx, dy);
                    }

                    if (tlist.numberOfItems) {
                        tlist.insertItemBefore(xform, 0);
                    } else {
                        tlist.appendItem(xform);
                    }

                    var cmd = svgedit.recalculate.recalculateDimensions(selected);
                    if (cmd) {
                        batchCmd.addSubCommand(cmd);
                    }

                    selectorManager.requestSelector(selected).resize();
                }
            }
            if (!batchCmd.isEmpty()) {
                if (undoable) {
                    addCommandToHistory(batchCmd);
                }
                call('changed', selectedElements);
                return batchCmd;
            }
        };

        this.moveElements = function (dx, dy, elems, undoable) {
            if (dx.constructor != Array) {
                dx /= current_zoom;
                dy /= current_zoom;
            }
            undoable = (undoable == null) ? true : undoable;
            var batchCmd = new svgedit.history.BatchCommand('position');
            var i = elems.length;
            while (i--) {
                var selected = elems[i];
                if (selected != null) {
                    var xform = svgroot.createSVGTransform();
                    var tlist = svgedit.transformlist.getTransformList(selected);
                    // dx and dy could be arrays
                    if (dx.constructor == Array) {
                        xform.setTranslate(dx[i], dy[i]);
                    } else {
                        xform.setTranslate(dx, dy);
                    }
                    if (tlist.numberOfItems) {
                        tlist.insertItemBefore(xform, 0);
                    } else {
                        tlist.appendItem(xform);
                    }

                    var cmd = svgedit.recalculate.recalculateDimensions(selected);
                    if (cmd) {
                        batchCmd.addSubCommand(cmd);
                    }
                    //selectorManager.requestSelector(selected).resize();
                }
            }

            if (!batchCmd.isEmpty()) {
                if (undoable) {
                    addCommandToHistory(batchCmd);
                }
                call('changed', elems);
                return batchCmd;
            }
        };

        this.getCenter = function(elem) {
            let centerX,centerY ;
            switch(elem.tagName) {
                case 'image':
                case 'rect':
                    centerX = elem.x.baseVal.value + elem.width.baseVal.value /2 ;
                    centerY = elem.y.baseVal.value + elem.height.baseVal.value /2 ;
                    break;
                case 'line':
                    centerX = (elem.x1.baseVal.value + elem.x2.baseVal.value) /2 ;
                    centerY = (elem.y1.baseVal.value + elem.y2.baseVal.value) /2 ;
                    break;
                case 'ellipse':
                    centerX = elem.cx.baseVal.value;
                    centerY = elem.cy.baseVal.value;
                    break;
                case 'polygon':
                case 'path':
                case 'use':
                    let realLocation = this.getSvgRealLocation(elem);
                    centerX = realLocation.x + realLocation.width/2 ;
                    centerY = realLocation.y + realLocation.height/2 ;
                    break;
            }
            return {
                x: centerX,
                y: centerY
            };
        };

        this.distHori = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            const centerXs = [];
            let minX = Number.MAX_VALUE,
                maxX = Number.MIN_VALUE;
            let indexMax = -1,
                indexMin = -1;

            const realSelectedElements = selectedElements.filter(e => e);
            const len = realSelectedElements.length;

            if (len < 3) {
                return;
            }

            for (let i = 0; i < len; i=i+1) {
                const elem = realSelectedElements[i];

                let centerX = this.getCenter(elem).x;
                centerXs[i] = centerX;
                if (centerX < minX) {
                    minX = centerX;
                    indexMin = i;
                }
                if (centerX > maxX) {
                    maxX = centerX;
                    indexMax = i;
                }
            }

            if (indexMin === indexMax || maxX === minX) {
                return;
            }

            const dx = (maxX - minX) /(len-1);

            let j = 1;

            for (let i = indexMin + 1; i< len + indexMin ; i=i+1) {
                if ( (i === indexMax) || (i-len) === indexMax ) {
                    continue;
                }
                if (i < len) {
                    this.moveElements([(minX + dx*j) - centerXs[i]], [0], [realSelectedElements[i]]);
                    selectorManager.requestSelector(realSelectedElements[i]).resize();
                } else {
                    this.moveElements([(minX + dx*j) - centerXs[i-len]], [0], [realSelectedElements[i-len]]);
                    selectorManager.requestSelector(realSelectedElements[i-len]).resize();
                }
                j = j+1;
            }

        };

        this.distVert = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            const centerYs = [];
            let minY = Number.MAX_VALUE,
                maxY = Number.MIN_VALUE;
            let indexMax = -1,
                indexMin = -1;

            const realSelectedElements = selectedElements.filter(e => e);
            const len = realSelectedElements.length;

            if (len < 3) {
                return;
            }

            for (let i = 0; i < len; i=i+1) {
                const elem = realSelectedElements[i];

                let centerY = this.getCenter(elem).y;
                centerYs[i] = centerY;
                if (centerY < minY) {
                    minY = centerY;
                    indexMin = i;
                }
                if (centerY > maxY) {
                    maxY = centerY;
                    indexMax = i;
                }
            }

            if (indexMin === indexMax || maxY === minY) {
                return;
            }

            const dy = (maxY - minY) /(len-1);

            let j = 1;

            for (let i = indexMin + 1; i< len + indexMin ; i=i+1) {
                if ( (i === indexMax) || (i-len) === indexMax ) {
                    continue;
                }
                if (i < len) {
                    this.moveElements([0], [(minY + dy*j) - centerYs[i]], [realSelectedElements[i]]);
                    selectorManager.requestSelector(realSelectedElements[i]).resize();
                } else {
                    this.moveElements([0], [(minY + dy*j) - centerYs[i-len]], [realSelectedElements[i-len]]);
                    selectorManager.requestSelector(realSelectedElements[i-len]).resize();
                }
                j = j+1;
            }

        };

        this.distEven = function () {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            const centerXs = [];
            const centerYs = [];
            let minX = Number.MAX_VALUE,
                minY = Number.MAX_VALUE,
                maxX = Number.MIN_VALUE,
                maxY = Number.MIN_VALUE;
            let indexMinX = -1,
                indexMinY = -1,
                indexMaxX = -1,
                indexMaxY = -1;

            const realSelectedElements = selectedElements.filter(e => e);
            const len = realSelectedElements.length;

            if (len < 3) {
                return;
            }

            for (let i = 0; i < len; i=i+1) {
                if (realSelectedElements[i] == null) {
                    console.error('distributing null');
                    break;
                }
                const elem = realSelectedElements[i];

                let center = this.getCenter(elem);
                centerXs[i] = center.x;
                centerYs[i] = center.y;
                if ( center.x < minX) {
                    minX = center.x;
                    indexMinX = i;
                }
                if ( center.x > maxX) {
                    maxX = center.x;
                    indexMaxX = i;
                }
                if ( center.y < minY) {
                    minY = center.y;
                    indexMinY = i;
                }
                if ( center.y > maxY) {
                    maxY = center.y;
                    indexMaxY = i;
                }
            }

            if ((indexMinX === indexMaxX) && (indexMinY === indexMaxY)) {
                return;
            }
            const diffX = maxX-minX;
            const diffY = maxY-minY;

            let start=-1,
                end=-1;

            if(diffX >= diffY) {
                start = indexMinX;
                end = indexMaxX;
            } else {
                start = indexMinY;
                end = indexMaxY;
            }
            const startX = centerXs[start];
            const startY = centerYs[start];
            const dx = (centerXs[end] - startX) /(len-1);
            const dy = (centerYs[end] - startY) /(len-1);
            let j = 1;

            for (let i = start + 1; i< len + start ; i=i+1) {
                if ( (i === end) || (i-len) === end ) {
                    continue;
                }
                if (i < len) {
                    this.moveElemPosition((startX + dx*j) - centerXs[i], (startY + dy*j) - centerYs[i], realSelectedElements[i]);
                } else {
                    this.moveElemPosition((startX + dx*j) - centerXs[i-len], (startY + dy*j) - centerYs[i-len], realSelectedElements[i-len]);
                }
                j = j+1;
            }
        };

        this.booleanOperationSelectedElements = function(mode) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            let len = selectedElements.length;
            for (let i = 0; i < selectedElements.length; ++i) {
                if (!selectedElements[i]) {
                    len = i;
                    break;
                }
            }
            if (len < 2) {
                AlertActions.showPopupError('Boolean Operate', LANG.popup.select_at_least_two);
                return;
            }
            if (len > 2 && mode === 'diff') {
                //TODO: lang
                AlertActions.showPopupError('Boolean Operate', LANG.popup.more_than_two_object);
                return;
            }
            let batchCmd = new svgedit.history.BatchCommand(`${mode} Elements`);
            // clipper needs integer input so scale up path with a big const.
            const scale = 100;
            let solution_paths = [];
            const modemap = {'intersect': 0, 'union': 1, 'diff': 2, 'xor': 3};
            const clipType = modemap[mode];
            const subject_fillType = 1;
            const clip_fillType = 1;
            let succeeded = true;
            for (let i = len - 1; i >= 0; --i) {
                let clipper = new svgedit.ClipperLib.Clipper();
                const elem =selectedElements[i];
                if (!(elem.tagName === 'rect' || elem.tagName === 'path' || elem.tagName === 'polygon' || elem.tagName === 'ellipse' || elem.tagName === 'line')) {
                    tagNameMap = {
                        'g': LANG.tag.g,
                        'use': LANG.tag.use,
                        'image': LANG.tag.image,
                        'text': LANG.tag.text
                    };
                    AlertActions.showPopupError('Boolean Operate', `${LANG.popup.not_support_object_type}: ${tagNameMap[elem.tagName]}`);
                    return;
                }
                const dpath = svgedit.utilities.getPathDFromElement(elem);
                const bbox = svgedit.utilities.getBBox(elem);
                let rotation = {
                    angle: svgedit.utilities.getRotationAngle(elem),
                    cx: bbox.x + bbox.width / 2,
                    cy: bbox.y + bbox.height / 2
                };
                const paths = svgedit.ClipperLib.dPathtoPointPathsAndScale(dpath, rotation, scale);
                if (i === len - 1) {
                    solution_paths = paths;
                } else {
                    clipper.AddPaths(solution_paths, svgedit.ClipperLib.PolyType.ptSubject, true);
                    clipper.AddPaths(paths, svgedit.ClipperLib.PolyType.ptClip, true);
                    succeeded = clipper.Execute(clipType, solution_paths, subject_fillType, clip_fillType);
                }
                if (!succeeded) {
                    break;
                }
            }

            if (succeeded) {
                let d = '';
                for (let i = 0; i < solution_paths.length; ++i) {
                    d += 'M';
                    d += solution_paths[i].map(x => `${x.X / scale},${x.Y / scale}`).join(' L');
                    d += ' Z'
                }
                const base = selectedElements[len-1];
                const fill = $(base).attr('fill');
                const fill_opacity = $(base).attr('fill-opacity');
                element = addSvgElementFromJson({
                    element: 'path',
                    curStyles: false,
                    attr: {
                        id: getNextId(),
                        d: d,
                        stroke: '#000',
                        fill: fill,
                        'fill-opacity': fill_opacity,
                        opacity: cur_shape.opacity
                    }
                });
                if (this.isUseLayerColor) {
                    this.updateElementColor(element);
                }
            } else {
                console.log('Clipper not succeeded');
                return;
            }
            batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(element));
            let cmd = this.deleteSelectedElements();
            batchCmd.addSubCommand(cmd);
            canvas.undoMgr.undoStackPointer -= 1;
            canvas.undoMgr.undoStack.pop();
            addCommandToHistory(batchCmd);
            this.selectOnly([element], true);
            //console.log(canvas.undoMgr);
        }

        this.flipSelectedElements = function (horizon=1, vertical=1) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            let len = selectedElements.length;
            for (let i = 0; i < selectedElements.length; ++i) {
                if (!selectedElements[i]) {
                    len = i;
                    break;
                }
            }
            let batchCmd = new svgedit.history.BatchCommand('Flip Elements');

            for (let i = 0; i < len; ++i) {
                elem = selectedElements[i];
                let bbox;
                if (elem.tagName === 'use') {
                    bbox = this.getSvgRealLocation(elem);
                } else {
                    bbox = this.calculateTransformedBBox(elem);
                }

                const center = {x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2};
                const centers = [center];
                const flipPara = {horizon, vertical};
                startTransform = elem.getAttribute('transform'); //???maybe non need

                let cmd;
                let stack = [{elem}];
                while (stack.length > 0) {
                    ({elem: topElem, originalAngle} = stack.pop());
                    if (topElem.tagName !== 'g') {
                        cmd = this.flipElementWithRespectToCenter(topElem, centers[centers.length - 1], flipPara);
                        if (!cmd.isEmpty()) {
                            batchCmd.addSubCommand(cmd);
                        }
                    } else {
                        if (originalAngle == null) {
                            let angle = svgedit.utilities.getRotationAngle(topElem);
                            if (angle !== 0) {
                                canvas.undoMgr.beginUndoableChange('transform', [topElem]);
                                canvas.setRotationAngle(0, true, topElem);
                                cmd = canvas.undoMgr.finishUndoableChange();
                                if (!cmd.isEmpty()) {
                                    batchCmd.addSubCommand(cmd);
                                }
                                stack.push({elem: topElem, originalAngle: angle});
                            }
                            // if g has tlist, inverse to flip element inside
                            const tlist = svgedit.transformlist.getTransformList(topElem);
                            ({x, y} = centers[centers.length - 1]);
                            for (let i = 0; i < tlist.numberOfItems; i++) {
                                const t = tlist.getItem(i);
                                //type 4 does not matter
                                if (t.type === 4) {
                                    continue;
                                }
                                ({a, b, c, d, e, f} = t.matrix);
                                const delta = a * d - b * c;
                                x = (d * x - c * y + c * f - d * e) / delta;
                                y = (-b * x + a * y - a * f + b * e) / delta;
                            };
                            centers.push({x, y});
                            topElem.childNodes.forEach((e) => {
                                stack.push({elem: e});
                            }); 
                        } else {
                            centers.pop();
                            canvas.setRotationAngle(-originalAngle, true, topElem);
                        }
                    }
                }
                selectorManager.requestSelector(elem).resize();
                selectorManager.requestSelector(elem).showGrips(true);
                window.updateContextPanel();
            }
            addCommandToHistory(batchCmd);
        }

        this.flipElementWithRespectToCenter = function(elem, center, flipPara) {
            let batchCmd = new svgedit.history.BatchCommand('Flip Single Element');

            const angle = svgedit.utilities.getRotationAngle(elem);
            canvas.undoMgr.beginUndoableChange('transform', [elem]);
            canvas.setRotationAngle(0, true, elem);
            svgedit.recalculate.recalculateDimensions(elem);
            canvas.setRotationAngle(-angle, true, elem);
            let cmd = canvas.undoMgr.finishUndoableChange();
            if (!cmd.isEmpty()) {
                batchCmd.addSubCommand(cmd);
            }
            let bbox;
            if (elem.tagName === 'use') {
                bbox = this.getSvgRealLocation(elem);
            } else {
                bbox = this.calculateTransformedBBox(elem);
            }
            const cx = bbox.x + bbox.width / 2;
            const cy = bbox.y + bbox.height / 2;
            const dx = flipPara.horizon < 0 ? 2 * (center.x - cx) : 0;
            const dy = flipPara.vertical < 0 ? 2 * (center.y - cy) : 0;
            const tlist = svgedit.transformlist.getTransformList(elem);
            if (elem.tagName !== 'image') {
                let translateOrigin = svgroot.createSVGTransform();
                let scale = svgroot.createSVGTransform();
                let translateBack = svgroot.createSVGTransform();

                translateOrigin.setTranslate(-cx, -cy);
                scale.setScale(flipPara.horizon, flipPara.vertical);
                translateBack.setTranslate(cx, cy);
                const hasMatrix = svgedit.math.hasMatrixTransform(tlist);
                if (hasMatrix) {
                    const pos = angle ? 1 : 0;
                    tlist.insertItemBefore(translateOrigin, pos);
                    tlist.insertItemBefore(scale, pos);
                    tlist.insertItemBefore(translateBack, pos);
                } else {
                    tlist.appendItem(translateBack);
                    tlist.appendItem(scale);
                    tlist.appendItem(translateOrigin);
                }
                cmd = svgedit.recalculate.recalculateDimensions(elem);
            } else {
                cmd = this._flipImage(elem, flipPara.horizon, flipPara.vertical);
            }
            if (!cmd.isEmpty()) {
                batchCmd.addSubCommand(cmd);
            }
            cmd = this.moveElements([dx], [dy], [elem], false);
            batchCmd.addSubCommand(cmd);
            return batchCmd;
        }

        this._flipImage = function(image, horizon=1, vertical=1) {
            const flipCanvas = document.createElement('canvas');
            const flipContext = flipCanvas.getContext('2d');
            flipCanvas.width = $(image).attr('width');
            flipCanvas.height = $(image).attr('height');
            flipContext.translate(horizon < 0 ? flipCanvas.width : 0, vertical < 0 ? flipCanvas.height : 0);
            flipContext.scale(horizon, vertical);
            flipContext.drawImage(image, 0, 0, flipCanvas.width, flipCanvas.height);

            canvas.undoMgr.beginUndoableChange('xlink:href', [image]);
            image.setAttribute('xlink:href', flipCanvas.toDataURL());
            const cmd = canvas.undoMgr.finishUndoableChange();

            return cmd;
        };

        // Function: cloneSelectedElements
        // Create deep DOM copies (clones) of all selected elements and move them slightly
        // from their originals
        this.cloneSelectedElements = function (x, y) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }

            var i, elem;
            var batchCmd = new svgedit.history.BatchCommand('Clone Elements');
            // find all the elements selected (stop at first null)
            var len = selectedElements.length;

            function sortfunction(a, b) {
                return ($(b).index() - $(a).index()); //causes an array to be sorted numerically and ascending
            }
            selectedElements.sort(sortfunction);
            for (i = 0; i < len; ++i) {
                elem = selectedElements[i];
                if (elem == null) {
                    break;
                }
            }
            // use slice to quickly get the subset of elements we need
            var copiedElements = selectedElements.slice(0, i);
            this.clearSelection(true);
            // note that we loop in the reverse way because of the way elements are added
            // to the selectedElements array (top-first)
            var drawing = getCurrentDrawing();
            i = copiedElements.length;
            while (i--) {
                // clone each element and replace it within copiedElements
                elem = copiedElements[i] = drawing.copyElem(copiedElements[i]);
                (current_group || drawing.getCurrentLayer()).appendChild(elem);
                batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(elem));
            }

            if (!batchCmd.isEmpty()) {
                addToSelection(copiedElements.reverse()); // Need to reverse for correct selection-adding
                this.moveSelectedElements(x, y, false);
                addCommandToHistory(batchCmd);
            }
        };

        // Function: alignSelectedElements
        // Aligns selected elements
        //
        // Parameters:
        // type - String with single character indicating the alignment type
        // relative_to - String that must be one of the following:
        // "selected", "largest", "smallest", "page"
        this.alignSelectedElements = function (type, relative_to) {
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var i, elem;
            var bboxes = [];
            var minx = Number.MAX_VALUE,
                maxx = Number.MIN_VALUE,
                miny = Number.MAX_VALUE,
                maxy = Number.MIN_VALUE;
            var curwidth = Number.MIN_VALUE,
                curheight = Number.MIN_VALUE;
            var len = selectedElements.length;
            if (!len) {
                return;
            }
            for (i = 0; i < len; ++i) {
                if (selectedElements[i] == null) {
                    break;
                }
                elem = selectedElements[i];
                bboxes[i] = getStrokedBBox([elem]);

                // now bbox is axis-aligned and handles rotation
                switch (relative_to) {
                    case 'smallest':
                        if ((type === 'l' || type === 'c' || type === 'r') && (curwidth === Number.MIN_VALUE || curwidth > bboxes[i].width) ||
                            (type === 't' || type === 'm' || type === 'b') && (curheight === Number.MIN_VALUE || curheight > bboxes[i].height)) {
                            minx = bboxes[i].x;
                            miny = bboxes[i].y;
                            maxx = bboxes[i].x + bboxes[i].width;
                            maxy = bboxes[i].y + bboxes[i].height;
                            curwidth = bboxes[i].width;
                            curheight = bboxes[i].height;
                        }
                        break;
                    case 'largest':
                        if ((type === 'l' || type === 'c' || type === 'r') && (curwidth === Number.MIN_VALUE || curwidth < bboxes[i].width) ||
                            (type === 't' || type === 'm' || type === 'b') && (curheight === Number.MIN_VALUE || curheight < bboxes[i].height)) {
                            minx = bboxes[i].x;
                            miny = bboxes[i].y;
                            maxx = bboxes[i].x + bboxes[i].width;
                            maxy = bboxes[i].y + bboxes[i].height;
                            curwidth = bboxes[i].width;
                            curheight = bboxes[i].height;
                        }
                        break;
                    default: // 'selected'
                        if (bboxes[i].x < minx) {
                            minx = bboxes[i].x;
                        }
                        if (bboxes[i].y < miny) {
                            miny = bboxes[i].y;
                        }
                        if (bboxes[i].x + bboxes[i].width > maxx) {
                            maxx = bboxes[i].x + bboxes[i].width;
                        }
                        if (bboxes[i].y + bboxes[i].height > maxy) {
                            maxy = bboxes[i].y + bboxes[i].height;
                        }
                        break;
                }
            } // loop for each element to find the bbox and adjust min/max

            if (relative_to === 'page') {
                minx = 0;
                miny = 0;
                maxx = canvas.contentW;
                maxy = canvas.contentH;
            }

            var dx = new Array(len);
            var dy = new Array(len);
            for (i = 0; i < len; ++i) {
                if (selectedElements[i] == null) {
                    break;
                }
                elem = selectedElements[i];
                var bbox = bboxes[i];
                dx[i] = 0;
                dy[i] = 0;
                switch (type) {
                    case 'l': // left (horizontal)
                        dx[i] = minx - bbox.x;
                        break;
                    case 'c': // center (horizontal)
                        dx[i] = (minx + maxx) / 2 - (bbox.x + bbox.width / 2);
                        break;
                    case 'r': // right (horizontal)
                        dx[i] = maxx - (bbox.x + bbox.width);
                        break;
                    case 't': // top (vertical)
                        dy[i] = miny - bbox.y;
                        break;
                    case 'm': // middle (vertical)
                        dy[i] = (miny + maxy) / 2 - (bbox.y + bbox.height / 2);
                        break;
                    case 'b': // bottom (vertical)
                        dy[i] = maxy - (bbox.y + bbox.height);
                        break;
                }
            }
            this.moveSelectedElements(dx, dy);
        };

        // Group: Additional editor tools

        this.contentW = getResolution().w;
        this.contentH = getResolution().h;

        // Function: updateCanvas
        // Updates the editor canvas width/height/position after a zoom has occurred
        //
        // Parameters:
        // w - Float with the new width
        // h - Float with the new height
        //
        // Returns:
        // Object with the following values:
        // * x - The canvas' new x coordinate
        // * y - The canvas' new y coordinate
        // * old_x - The canvas' old x coordinate
        // * old_y - The canvas' old y coordinate
        // * d_x - The x position difference
        // * d_y - The y position difference
        this.updateCanvas = function (w, h) {
            svgroot.setAttribute('width', w);
            svgroot.setAttribute('height', h);
            var bg = $('#canvasBackground')[0];
            var old_x = svgcontent.getAttribute('x');
            var old_y = svgcontent.getAttribute('y');
            var x = (w / 2 - this.contentW * current_zoom / 2);
            var y = (h / 2 - this.contentH * current_zoom / 2);

            svgedit.utilities.assignAttributes(svgcontent, {
                width: this.contentW * current_zoom,
                height: this.contentH * current_zoom,
                'x': x,
                'y': y,
                'viewBox': '0 0 ' + this.contentW + ' ' + this.contentH
            });

            svgedit.utilities.assignAttributes(bg, {
                width: svgcontent.getAttribute('width'),
                height: svgcontent.getAttribute('height'),
                x: x,
                y: y
            });

            var bg_img = svgedit.utilities.getElem('background_image');
            if (bg_img) {
                svgedit.utilities.assignAttributes(bg_img, {
                    'width': '100%',
                    'height': '100%'
                });
            }

            selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')');
            runExtensions('canvasUpdated', {
                new_x: x,
                new_y: y,
                old_x: old_x,
                old_y: old_y,
                d_x: x - old_x,
                d_y: y - old_y
            });
            return {
                x: x,
                y: y,
                old_x: old_x,
                old_y: old_y,
                d_x: x - old_x,
                d_y: y - old_y
            };
        };

        // Function: setBackground
        // Set the background of the editor (NOT the actual document)
        //
        // Parameters:
        // color - String with fill color to apply
        // url - URL or path to image to use
        this.setBackground = function (color, url) {
            var bg = svgedit.utilities.getElem('canvasBackground');
            var border = $(bg).find('rect')[0];
            var bg_img = svgedit.utilities.getElem('background_image');
            border.setAttribute('fill', color);
            if (url) {
                if (!bg_img) {
                    bg_img = svgdoc.createElementNS(NS.SVG, 'image');
                    svgedit.utilities.assignAttributes(bg_img, {
                        'id': 'background_image',
                        'width': '100%',
                        'height': '100%',
                        'preserveAspectRatio': 'xMinYMin',
                        'style': 'pointer-events:none; opacity: 0.8;',
                    });
                    bg.appendChild(bg_img);
                }
                setHref(bg_img, url);
            } else if (bg_img) {
                bg_img.parentNode.removeChild(bg_img);
            }
        };

        // Function: cycleElement
        // Select the next/previous element within the current layer
        //
        // Parameters:
        // next - Boolean where true = next and false = previous element
        this.cycleElement = function (next) {
            var num;
            if (tempGroup) {
                let children = this.ungroupTempGroup();
                this.selectOnly(children, false);
            }
            var cur_elem = selectedElements[0];
            var elem = false;
            var all_elems = getVisibleElements(current_group || getCurrentDrawing().getCurrentLayer());
            if (!all_elems.length) {
                return;
            }
            if (cur_elem == null) {
                num = next ? all_elems.length - 1 : 0;
                elem = all_elems[num];
            } else {
                var i = all_elems.length;
                while (i--) {
                    if (all_elems[i] == cur_elem) {
                        num = next ? i - 1 : i + 1;
                        if (num >= all_elems.length) {
                            num = 0;
                        } else if (num < 0) {
                            num = all_elems.length - 1;
                        }
                        elem = all_elems[num];
                        break;
                    }
                }
            }
            selectOnly([elem], true);
            call('selected', selectedElements);
        };

        this.clear();


        // DEPRECATED: getPrivateMethods
        // Since all methods are/should be public somehow, this function should be removed

        // Being able to access private methods publicly seems wrong somehow,
        // but currently appears to be the best way to allow testing and provide
        // access to them to plugins.
        this.getPrivateMethods = function () {
            var obj = {
                addCommandToHistory: addCommandToHistory,
                setGradient: setGradient,
                addSvgElementFromJson: addSvgElementFromJson,
                assignAttributes: assignAttributes,
                BatchCommand: BatchCommand,
                call: call,
                ChangeElementCommand: ChangeElementCommand,
                copyElem: function (elem) {
                    return getCurrentDrawing().copyElem(elem);
                },
                ffClone: ffClone,
                findDefs: findDefs,
                findDuplicateGradient: findDuplicateGradient,
                getElem: getElem,
                getId: getId,
                getIntersectionList: getIntersectionList,
                getMouseTarget: getMouseTarget,
                getNextId: getNextId,
                getPathBBox: getPathBBox,
                getUrlFromAttr: getUrlFromAttr,
                hasMatrixTransform: hasMatrixTransform,
                identifyLayers: identifyLayers,
                InsertElementCommand: InsertElementCommand,
                isIdentity: svgedit.math.isIdentity,
                logMatrix: logMatrix,
                matrixMultiply: matrixMultiply,
                MoveElementCommand: MoveElementCommand,
                preventClickDefault: svgedit.utilities.preventClickDefault,
                recalculateAllSelectedDimensions: recalculateAllSelectedDimensions,
                recalculateDimensions: recalculateDimensions,
                remapElement: remapElement,
                RemoveElementCommand: RemoveElementCommand,
                removeUnusedDefElems: removeUnusedDefElems,
                round: round,
                runExtensions: runExtensions,
                sanitizeSvg: sanitizeSvg,
                SVGEditTransformList: svgedit.transformlist.SVGTransformList,
                toString: toString,
                transformBox: svgedit.math.transformBox,
                transformListToTransform: transformListToTransform,
                transformPoint: transformPoint,
                walkTree: svgedit.utilities.walkTree
            };
            return obj;
        };


        this.getSvgRealLocation = function (elem) {
            if (elem.tagName === 'polygon' || elem.tagName === 'polygon') {
                return elem.getBBox();
            }
            const ts = $(elem).attr('transform') || '';
            const xform = $(elem).attr('data-xform');
            const elemX = parseFloat($(elem).attr('x') || '0');
            const elemY = parseFloat($(elem).attr('y') || '0');

            let obj = {};
            if (xform) {
                xform.split(' ').forEach((pair) => {
                    [key, value] = pair.split('=');
                    if (value === undefined) {
                        return;
                    };
                    obj[key] = parseFloat(value);
                });
            } else {
                obj = elem.getBBox();
                obj.x = 0;
                obj.y = 0;
            }
            const matrix = ts.match(/matrix\(.*?\)/g);

            const matr = matrix ? matrix[0].substring(7, matrix[0].length - 1) : '1,0,0,1,0,0';
            [a, b, c, d, e, f] = matr.split(',').map(parseFloat);
            let x = a * obj.x + c * obj.y + e + a * elemX;
            let y = b * obj.x + d * obj.y + f + d * elemY;

            let width = obj.width * a;
            let height = obj.height * d;
            
            if (width < 0) {
                x += width;
                width *= -1;
            }
            if (height < 0) {
                y += height;
                height *= -1;
            }
            return {
                x: x,
                y: y,
                width: width,
                height: height
            };
        };

        this.calculateTransformedBBox = function(elem) {
            const tlist = svgedit.transformlist.getTransformList(elem);
            const bbox = elem.getBBox();
            points = [
                {x: bbox.x, y: bbox.y},
                {x: bbox.x + bbox.width, y: bbox.y},
                {x: bbox.x, y: bbox.y + bbox.height},
                {x: bbox.x + bbox.width, y: bbox.y + bbox.height},
            ]
            for (let i = tlist.numberOfItems-1; i >= 0; i--) {
                const t = tlist.getItem(i);
                if (t.type === 4) {
                    break;
                }
                points = points.map(p => {
                    const x = t.matrix.a * p.x + t.matrix.c * p.y + t.matrix.e;
                    const y = t.matrix.b * p.x + t.matrix.d * p.y + t.matrix.f;
                    return {x, y};
                });
            };
            let minX = points[0].x;
            let minY = points[0].y;
            let maxX = points[0].x;
            let maxY = points[0].y;
            points.forEach(p => {
                minX = Math.min(p.x, minX);
                maxX = Math.max(p.x, maxX);
                minY = Math.min(p.y, minY);
                maxY = Math.max(p.y, maxY);
            });
            return {x: minX, y:minY, width: maxX - minX, height: maxY - minY};
        };

        String.prototype.format = function () {
            a = this;
            for (k in arguments) {
                a = a.replace('{' + k + '}', arguments[k]);
            }
            return a;
        };

        this.moveElemPosition = function (dx, dy, elem) {
            if (elem === null) {
                return;
            }

            switch(elem.tagName) {
                case 'image':
                case 'rect':
                    if(dx !== 0) {
                        elem.setAttribute('x', elem.x.baseVal.value + dx);
                    }
                    if(dy !== 0) {
                        elem.setAttribute('y', elem.y.baseVal.value + dy);
                    }
                    break;
                case 'line':
                    if(dx !== 0) {
                        elem.setAttribute('x1', elem.x1.baseVal.value + dx);
                        elem.setAttribute('x2', elem.x2.baseVal.value + dx);
                    }
                    if(dy !== 0) {
                        elem.setAttribute('y1', elem.y1.baseVal.value + dy);
                        elem.setAttribute('y2', elem.y2.baseVal.value + dy);
                    }
                    break;
                case 'ellipse':
                    if(dx !== 0) {
                        elem.setAttribute('cx', elem.cx.baseVal.value + dx);
                    }
                    if(dy !== 0) {
                        elem.setAttribute('cy', elem.cy.baseVal.value + dy);
                    }
                    break;
                case 'use':
                    let xform = svgroot.createSVGTransform();
                    let tlist = svgedit.transformlist.getTransformList(elem);

                    xform.setTranslate(dx, dy);
                    if (tlist.numberOfItems) {
                        tlist.insertItemBefore(xform, 0);
                    } else {
                        tlist.appendItem(xform);
                    }
                    break;
            }

            selectorManager.requestSelector(elem).resize();
            recalculateAllSelectedDimensions();

        };

        //   this.calcLocation = function(elem, para, val) {
        // 		  const ts = $(elem).attr('transform');
        // 		  const xform = $(elem).attr('data-xform');
        // 		  const elemX = parseFloat($(elem).attr('x'));
        // 		  const elemY = parseFloat($(elem).attr('y'));

        // 		  const obj = {};
        // 		  xform.split(" ").forEach((pair) => {
        // 			  	[key, value] = pair.split("=");
        // 			  	if (value === undefined) { return };
        // 			  	obj[key] = parseFloat(value);
        // 		  });

        // 		  const matrix = ts.match(/matrix\(.*?\)/g);
        // 		  const matr = matrix[0].substring(7, matrix[0].length - 1);
        // 		  [a, b, c, d, e, f] = matr.split(',').map(parseFloat);

        // 		  const x = a * obj.x + c * obj.y + e + a * elemX;
        // 		  const y = b * obj.x + d * obj.y + f + d * elemY;
        // 		  const width = obj.width * a;
        // 		  const height = obj.height * d;

        // 		  if (para === undefined) {
        // 	        return {
        // 		          x: x,
        // 		          y: y,
        // 		          width: width,
        // 		          height: height
        // 	        };
        // 		  }

        // 		  let offsetX, offsetY, scaleX, scaleY, newMatrix;
        // 		  switch (para) {
        // 				  case 'x':
        // 						  offsetX = (val - x) / a + elemX;
        // 						  return offsetX;
        // 						  break;
        // 				  case 'y':
        // 						  offsetY = (val - y) / d + elemY;
        // 						  return offsetY;
        // 						  break;
        // 				  case 'width':
        // 						  scaleX = val / obj.width;
        // 						  newMatrix = 'matrix({0}, {1}, {2}, {3}, {4}, {5})'.format(scaleX,b,c,d,e+(a-scaleX)*(obj.x+elemX),f);
        // 						  return newMatrix;
        // 						  break;
        // 				  case 'height':
        // 						  scaleY = val / obj.height;
        // 						  newMatrix = 'matrix({0}, {1}, {2}, {3}, {4}, {5})'.format(a,b,c,scaleY,e,f+(b-scaleY)*(obj.y+elemY));
        // 						  return newMatrix;
        // 						  break;
        // 				  default:
        // 						  return 'default';
        // 		  }
        //   };
        this.setSvgElemPosition = function (para, val) {
            const selected = selectedElements[0];
            const realLocation = this.getSvgRealLocation(selected);
            let dx = 0;
            let dy = 0;
            switch (para) {
                case 'x':
                    dx = val - realLocation.x;
                    break;
                case 'y':
                    dy = val - realLocation.y;
                    break;
            }

            let xform = svgroot.createSVGTransform();
            let tlist = svgedit.transformlist.getTransformList(selected);

            xform.setTranslate(dx, dy);
            if (tlist.numberOfItems) {
                tlist.insertItemBefore(xform, 0);
            } else {
                tlist.appendItem(xform);
            }

            selectorManager.requestSelector(selected).resize();
            recalculateAllSelectedDimensions();

        };
        // refer to resize behavior in mouseup mousemove mousedown
        this.setSvgElemSize = function (para, val) {
            const selected = selectedElements[0];
            const realLocation = this.getSvgRealLocation(selected);
            let sx = 1;
            let sy = 1;
            switch (para) {
                case 'width':
                    sx = val / realLocation.width;
                    break;
                case 'height':
                    sy = val / realLocation.height;
                    break;
            }

            startTransform = selected.getAttribute('transform'); //???maybe non need

            const tlist = svgedit.transformlist.getTransformList(selected);
            const left = realLocation.x;
            const top = realLocation.y;

            // update the transform list with translate,scale,translate
            let translateOrigin = svgroot.createSVGTransform();
            let scale = svgroot.createSVGTransform();
            let translateBack = svgroot.createSVGTransform();

            translateOrigin.setTranslate(-left, -top);
            scale.setScale(sx, sy);
            translateBack.setTranslate(left, top);

            const hasMatrix = svgedit.math.hasMatrixTransform(tlist);
            if (hasMatrix) {
                const pos = svgedit.utilities.getRotationAngle(selected) ? 1 : 0;
                tlist.insertItemBefore(translateOrigin, pos);
                tlist.insertItemBefore(scale, pos);
                tlist.insertItemBefore(translateBack, pos);
            } else {
                tlist.appendItem(translateBack);
                tlist.appendItem(scale);
                tlist.appendItem(translateOrigin);
            }

            selectorManager.requestSelector(selected).resize();

            selectorManager.requestSelector(selected).showGrips(true);

            svgedit.recalculate.recalculateDimensions(selected);

            window.updateContextPanel();
        };

        this.toggleGrid = function() {
            const showGrid = !(svgEditor.curConfig.showGrid || false);
            svgEditor.curConfig.showGrid = showGrid;
            require('electron').remote.Menu.getApplicationMenu().items.filter(i => i.id === '_view')[0]
            .submenu.items.filter(i => i.id === 'SHOW_GRIDS')[0].checked = showGrid;
            const canvasGridDisplay = showGrid ? 'inline' : 'none';
            $('#canvasGrid').attr('style', `display: ${canvasGridDisplay}`);
        }

        this.setRotaryMode = function(val) {
            // True or false
            rotaryMode = val;
        };
        this.getRotaryMode = function () {
            return rotaryMode;
        };

        this.setRotaryDisplayCoord = function (val) {
            BeamboxPreference.write('rotary_y_coord', val);
        };

        this.getRotaryDisplayCoord = function () {
            return BeamboxPreference.read('rotary_y_coord') || 5;
        }

        this.zoomSvgElem = function (zoomScale) {
            const selected = selectedElements[0];
            const realLocation = this.getSvgRealLocation(selected);

            startTransform = selected.getAttribute('transform'); //???maybe non need

            const tlist = svgedit.transformlist.getTransformList(selected);
            const left = realLocation.x;
            const top = realLocation.y;

            // update the transform list with translate,scale,translate
            let translateOrigin = svgroot.createSVGTransform();
            let scale = svgroot.createSVGTransform();
            let translateBack = svgroot.createSVGTransform();

            translateOrigin.setTranslate(-left, -top);
            scale.setScale(zoomScale, zoomScale);
            translateBack.setTranslate(left, top);

            const hasMatrix = svgedit.math.hasMatrixTransform(tlist);
            if (hasMatrix) {
                const pos = svgedit.utilities.getRotationAngle(selected) ? 1 : 0;
                tlist.insertItemBefore(translateOrigin, pos);
                tlist.insertItemBefore(scale, pos);
                tlist.insertItemBefore(translateBack, pos);
            } else {
                tlist.appendItem(translateBack);
                tlist.appendItem(scale);
                tlist.appendItem(translateOrigin);
            }

            selectorManager.requestSelector(selected).resize();

            selectorManager.requestSelector(selected).showGrips(true);

            svgedit.recalculate.recalculateDimensions(selected);
        };
    };


});
