define([
    'jsx!views/beambox/Right-Panels/Options-Blocks/Infill-Block',
    'jsx!widgets/Unit-Input-v2',
    'jsx!contexts/DialogCaller',
    'app/contexts/AlertCaller',
    'app/constants/alert-constants',
    'app/actions/beambox/font-funcs',
    'app/actions/beambox/constant',
    'helpers/i18n'
], function(
    InFillBlock,
    UnitInput,
    DialogCaller,
    Alert,
    AlertConstants,
    FontFuncs,
    Constant,
    i18n
) {
    const React = require('react');
    const classNames = require('classnames');
    const LANG = i18n.lang.beambox.right_panel.object_panel.option_panel;

    class TextOptions extends React.Component {
        constructor(props) {
            super(props);
            const { elem } = props;
            this.state = this.getStateFromElem(elem);
        }

        componentDidUpdate(prevProps) {
            const lastElem = prevProps.elem;
            const lastId = lastElem.getAttribute('id');
            const { elem } = this.props;
            if (elem.getAttribute('id') !== lastId) {
                this.setState(this.getStateFromElem(elem));
            }
        }

        getStateFromElem = (elem) => {
            const { updateDimensionValues } = this.props;
            const postscriptName = svgCanvas.getFontPostscriptName(elem);
            let font;
            if (postscriptName) {
                font = FontFuncs.getFontOfPostscriptName(postscriptName);
                if (!elem.getAttribute('font-style')) {
                    elem.setAttribute('font-style', font.italic ? 'italic' : 'normal');
                }
                if (!elem.getAttribute('font-weight')) {
                    elem.setAttribute('font-weight', font.weight ? font.weight : 'normal');
                }
            } else {
                const family = svgCanvas.getFontFamily(elem);
                const weight = svgCanvas.getFontWeight(elem);
                const italic = svgCanvas.getItalic(elem);
                font = FontFuncs.requestFontByFamilyAndStyle({family, weight, italic});
            }
            console.log(font);
            const sanitizedDefaultFontFamily = (() => {
                // use these font if postscriptName cannot find in user PC
                const fontFamilyFallback = ['PingFang TC', 'Arial', 'Times New Roman', 'Ubuntu', FontFuncs.availableFontFamilies[0]];
                const sanitizedFontFamily = [font.family, ...fontFamilyFallback].find(
                    f => FontFuncs.availableFontFamilies.includes(f)
                );
                return sanitizedFontFamily;
            })();

            if (sanitizedDefaultFontFamily !== font.family) {
                console.log(`unsupported font ${font.family}, fallback to ${sanitizedDefaultFontFamily}`);
                svgCanvas.setFontFamily(sanitizedDefaultFontFamily, true);
                svgCanvas.setFontPostscriptName(newFont.postscriptName, true);
                const newFont = FontFuncs.requestFontsOfTheFontFamily(sanitizedDefaultFontFamily)[0];
            }
            updateDimensionValues({fontStyle: font.style});
            return {
                fontFamily: sanitizedDefaultFontFamily,
                fontStyle: font.style,
                fontSize: Number(elem.getAttribute('font-size')),
                letterSpacing: svgCanvas.getLetterSpacing(elem),
                lineSpacing: parseFloat(elem.getAttribute('data-line-spacing') || '1'),
                isVerti: elem.getAttribute('data-verti') === 'true'
            };
        }

        handleFontFamilyChange = (newFamily) => {
            const { updateDimensionValues, updateObjectPanel } = this.props;
            const newFont = FontFuncs.requestFontsOfTheFontFamily(newFamily)[0];
            const batchCmd = new svgedit.history.BatchCommand('Change Font family');
            let cmd = svgCanvas.setFontPostscriptName(newFont.postscriptName, true);
            batchCmd.addSubCommand(cmd);
            cmd = svgCanvas.setItalic(newFont.italic, true);
            batchCmd.addSubCommand(cmd);
            cmd = svgCanvas.setFontWeight(newFont.weight, true);
            batchCmd.addSubCommand(cmd);
            cmd = svgCanvas.setFontFamily(newFamily, true);
            batchCmd.addSubCommand(cmd);
            svgCanvas.undoMgr.addCommandToHistory(batchCmd);
            const newStyle = newFont.style;
            updateDimensionValues({fontStyle: newStyle});
            this.setState({
                fontFamily: newFamily,
                fontStyle: newStyle
            });
            updateObjectPanel();
        }

        renderFontFamilyBlock = () => {
            const { fontFamily } = this.state;
            const options = FontFuncs.availableFontFamilies.map(
                option => (
                    <option value={option} key={option}>
                        {FontFuncs.fontNameMap.get(option)}
                    </option>
                )
            );
            const isOnlyOneOption = options.length === 1;
            return (
                <div className="option-block">
                        <div className="label">{LANG.font_family}</div>
                        <div className="select-container">
                            <select
                                value={fontFamily}
                                onChange={e => this.handleFontFamilyChange(e.target.value)}
                                className={classNames({'no-triangle': isOnlyOneOption})}
                                disabled={isOnlyOneOption}
                            >
                                {options}
                            </select>
                        </div>
                </div>
            );
        }

        handleFontStyleChange = (val) => {
            const { updateDimensionValues, updateObjectPanel } = this.props;
            const { fontFamily } = this.state;
            const font = FontFuncs.requestFontByFamilyAndStyle({
                family: fontFamily,
                style: val
            });
            const batchCmd = new svgedit.history.BatchCommand('Change Font Style');
            let cmd = svgCanvas.setFontPostscriptName(font.postscriptName, true);
            batchCmd.addSubCommand(cmd);
            cmd = svgCanvas.setItalic(font.italic, true);
            batchCmd.addSubCommand(cmd);
            cmd = svgCanvas.setFontWeight(font.weight, true);
            batchCmd.addSubCommand(cmd);
            svgCanvas.undoMgr.addCommandToHistory(batchCmd);
            updateDimensionValues({fontStyle: val});
            this.setState({
                fontStyle: val
            });
            updateObjectPanel();
        }

        renderFontStyleBlock = () => {
            const { fontFamily, fontStyle } = this.state;
            const fontStyles = FontFuncs.requestFontsOfTheFontFamily(fontFamily).map((f) => f.style);
            const options = fontStyles.map(option => (
                <option key={option} value={option}>{option}</option>
            ));
            const isOnlyOneOption = options.length === 1;
            return (
                <div className="option-block">
                        <div className="label">{LANG.font_style}</div>
                        <div className="select-container">
                            <select
                                value={fontStyle}
                                onChange={e => this.handleFontStyleChange(e.target.value)}
                                className={classNames({'no-triangle': isOnlyOneOption})}
                                disabled={isOnlyOneOption}
                            >
                                {options}
                            </select>
                        </div>
                </div>
            );
        }

        handleFontSizeChange = (val) => {
            const { updateObjectPanel } = this.props;
            svgCanvas.setFontSize(val);
            this.setState({
                fontSize: val
            });
        }

        renderFontSizeBlock = () => {
            const { fontSize } = this.state;
            return (
                <div className="option-block">
                    <div className="label">{LANG.font_size}</div>
                    <UnitInput
                        min={1}
                        unit='px'
                        decimal={0}
                        className={{'option-input': true}}
                        defaultValue={fontSize}
                        getValue={(val) => this.handleFontSizeChange(val)}
                    />
                </div>
            );
        }

        handleLetterSpacingChange = (val) => {
            svgCanvas.setLetterSpacing(val);
            this.setState({
                letterSpacing: val
            });
        }

        renderLetterSpacingBlock = () => {
            const { letterSpacing } = this.state;
            return (
                <div className="option-block">
                    <div className="label">{LANG.letter_spacing}</div>
                    <UnitInput
                        unit='em'
                        step={0.05}
                        className={{'option-input': true}}
                        defaultValue={letterSpacing}
                        getValue={(val) => this.handleLetterSpacingChange(val)}
                    />
                </div>
            );
        }

        handleLineSpacingChange = (val) => {
            svgCanvas.setTextLineSpacing(val);
            this.setState({
                lineSpacing: val
            });
        }

        renderLineSpacingBlock = () => {
            const { lineSpacing } = this.state;
            return (
                <div className="option-block">
                    <div className="label">{LANG.line_spacing}</div>
                    <UnitInput
                        unit=''
                        min={0.8}
                        step={0.1}
                        decimal={1}
                        className={{'option-input': true}}
                        defaultValue={lineSpacing}
                        getValue={(val) => this.handleLineSpacingChange(val)}
                    />
                </div>
            );
        }

        handleVerticalTextClick = () => {
            const { isVerti } = this.state;
            svgCanvas.setTextIsVertical(!isVerti);
            this.setState({isVerti: !isVerti});
        }

        renderVerticalTextSwitch = () => {
            const { isVerti } = this.state;
            return (
                <div className="option-block">
                    <div className="label">{LANG.vertical_text}</div>
                    <div className="onoffswitch" onClick={() => this.handleVerticalTextClick()}>
                        <input type="checkbox" className="onoffswitch-checkbox" checked={isVerti} readOnly={true}/>
                        <label className="onoffswitch-label">
                            <span className="onoffswitch-inner"></span>
                            <span className="onoffswitch-switch"></span>
                        </label>
                    </div>
                    
                </div>
            );
        }

        render() {
            const { elem } = this.props;
            return (
                <div className="text-options">
                    { this.renderFontFamilyBlock() }
                    { this.renderFontStyleBlock() }
                    { this.renderFontSizeBlock() }
                    { this.renderLetterSpacingBlock() }
                    { this.renderLineSpacingBlock() }
                    { this.renderVerticalTextSwitch() }
                    <InFillBlock elem={elem}/>
                </div>
            );
        }
    }

    return TextOptions;
});
