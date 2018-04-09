define([
    'app/actions/beambox/svgeditor-function-wrapper',
], function(
    FnWrapper
) {

    if (!window.electron) {
        console.log('font is not supported in web browser');
        return () => null;
    }
    const ipc = electron.ipc;
    const events = electron.events;

    const hashCode = function(s) {
        var h = 0, l = s.length, i = 0;
        if ( l > 0 ){
            while (i < l) {
                h = (h << 5) - h + s.charCodeAt(i++) | 0;
            }
        }
        return Math.abs(h);
    };
    const availableFontFamilies = (function requestAvailableFontFamilies() {
        // get all available fonts in user PC
        const fonts = ipc.sendSync(events.GET_AVAILABLE_FONTS);

        // make it unique
        const fontFamilySet = new Set();
        fonts.map(font => fontFamilySet.add(font.family));

        // transfer to array and sort!
        return Array.from(fontFamilySet).sort((a, b) => {
            if (a < b) {
                return -1;
            }
            if (a > b) {
                return 1;
            }
            return 0;
        });
    })();
    const requestFontStylesOfTheFontFamily = (family) => {
        // if you don't specify italic, it will just return fonts that are not italic
        const fontsNoItalic = ipc.sendSync(events.FIND_FONTS, { family: family, italic: false });
        const fontsItalic = ipc.sendSync(events.FIND_FONTS, { family: family, italic: true });
        const fonts = fontsNoItalic.concat(fontsItalic);
        const fontStyles = Array.from(fonts).map(font => font.style);

        return fontStyles;
    };
    const requestFontByFamilyAndStyle = ({family, style, weight, italic}) => {
        const font = ipc.sendSync(events.FIND_FONT, {
            family: family,
            style: style,
            weight: weight,
            italic: italic
        });
        return font;
    };
    const requestToConvertTextToPath = async ($textElement) => {
        const d = $.Deferred();

        const fontStyle = requestFontByFamilyAndStyle({
            family: $textElement.attr('font-family'),
            weight: $textElement.attr('font-weight'),
            italic: ($textElement.attr('font-style') === 'italic')
        }).style;

        const transform = $textElement.attr('transform') || '';

        const letterSpacing = (function() {
            const letterSpacingAttr = $textElement.attr('letter-spacing');
            if (!letterSpacingAttr) {
                return 0;
            } else {
                return letterSpacingAttr.replace('em', '');
            }
        })();

        // use key (which hash from $textElement html string) to prevent ipc event confliction
        const key = hashCode($textElement.prop('outerHTML'));
        ipc.once(events.RESOLVE_PATH_D_OF_TEXT + key, (sender, pathD) => {
            d.resolve(pathD);
        });

        ipc.send(events.REQUEST_PATH_D_OF_TEXT, {
            text: $textElement.text(),
            x: $textElement.attr('x'),
            y: $textElement.attr('y'),
            fontFamily: $textElement.attr('font-family'),
            fontSize: $textElement.attr('font-size'),
            fontStyle: fontStyle,
            letterSpacing: letterSpacing,
            key: key
        });
        const pathD = await d;

        const path = document.createElementNS(window.svgedit.NS.SVG, 'path');

        const isFill = (function(){
            const fillAttr = $textElement.attr('fill');
            if (['#fff', '#ffffff', 'none'].includes(fillAttr)) {
                return false;
            } else if(fillAttr || fillAttr === null) {
                return true;
            } else {
                return false;
            }
        })();

        $(path).attr({
            'id': svgCanvas.getNextId(),
            'd': pathD,
            'transform': transform,
            'fill': isFill ? '#000' : '#fff',
            'fill-opacity': isFill ? 1 : 0,
            'stroke': '#000',
            'stroke-width': 1,
            'stroke-opacity': 1,
            'stroke-dasharray': 'none',
            'vector-effect': 'non-scaling-stroke',
        });

        $(path).insertAfter($textElement);
        $textElement.remove();

        return;
    };
    const convertTextToPathAmoungSvgroot = async () => {
        FnWrapper.reset_select_mode();
        const allPromises = $('#svgroot')
            .find('text')
            .toArray()
            .map(
                el => requestToConvertTextToPath($(el))
            );
        await Promise.all(allPromises);
    };

    return {
        availableFontFamilies: availableFontFamilies,
        requestFontStylesOfTheFontFamily: requestFontStylesOfTheFontFamily,
        requestFontByFamilyAndStyle: requestFontByFamilyAndStyle,
        requestToConvertTextToPath: requestToConvertTextToPath,
        convertTextToPathAmoungSvgroot: convertTextToPathAmoungSvgroot
    };
});