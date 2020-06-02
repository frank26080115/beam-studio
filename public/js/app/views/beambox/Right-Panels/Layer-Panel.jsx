define([
    'jsx!app/actions/beambox/Laser-Panel-Controller',
    'jsx!app/views/beambox/Color-Picker-Panel',
    'app/contexts/AlertCaller',
    'app/constants/alert-constants',
    'helpers/i18n'
], function(
    LaserPanelController,
    ColorPickerPanel,
    Alert,
    AlertConstants,
    i18n
) {
    const React = require('react');
    const classNames = require('classnames');
    const LANG = i18n.lang.beambox.right_panel.layer_panel;

    class LayerPanel extends React.Component {
        constructor() {
            super();
            this.state = {
            };
            window.populateLayers = () => {
                this.setState(this.state);
            }
        }

        componentDidMount() {
        }

        componentWillUnmount() {
        }

        addLayerLaserConfig = (layername) => {
            LaserPanelController.initConfig(layername);
        };

        cloneLayerLaserConfig = (oldName, newName) => {
            LaserPanelController.cloneConfig(oldName, newName);
        };

        renderLayerLaserConfigs = () => {
            const drawing = svgCanvas.getCurrentDrawing();
            const currentLayerName = drawing.getCurrentLayerName();

            LaserPanelController.render(currentLayerName);
        };

        addNewLayer = () => {
            let uniqName;
            let i = svgCanvas.getCurrentDrawing().getNumLayers();
            while (svgCanvas.getCurrentDrawing().hasLayer(uniqName)) {
                uniqName = LANG.layers.layer + ' ' + (++i);
            }

            $.prompt(LANG.notification.enterUniqueLayerName, uniqName, (newName) => {
                if (!newName) {
                    return;
                }
                if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
                    Alert.popUp({
                        id: 'dupli layer name',
                        message: LANG.notification.dupeLayerName,
                    });
                    return;
                }
                svgCanvas.createLayer(newName);
                window.updateContextPanel();
                this.addLayerLaserConfig(newName);
                this.setState(this.state);
            });
        }

        cloneLayer = () => {
            const oldName = svgCanvas.getCurrentDrawing().getCurrentLayerName();
            var name = oldName + ' copy';

            $.prompt(LANG.notification.enterUniqueLayerName, name, (newName) => {
                if (!newName) {
                    return;
                }
                if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
                    Alert.popUp({
                        id: 'dupli layer name',
                        message: uiStrings.notification.dupeLayerName,
                    });
                    return;
                }
                svgCanvas.cloneLayer(newName);
                window.updateContextPanel();
                this.cloneLayerLaserConfig(newName, oldName);
                this.setState(this.state);
            });
        }

        deleteLayer = () => {
            if (svgCanvas.deleteCurrentLayer()) {
                window.updateContextPanel();
                this.setState(this.state);
            }
        }

        lockLayer = () => {
            svgCanvas.lockLayer();
            this.setState(this.state);
        }

        mergeLayer = () => {
            const drawing = svgCanvas.getCurrentDrawing();
            const layerCount = drawing.getNumLayers();
            let curIndex = drawing.getCurrentLayerPosition();
            if (curIndex === layerCount) {
                return;
            }
            svgCanvas.mergeLayer();
            window.updateContextPanel();
            this.setState(this.state);
        }

        mergeAllLayer = () => {
            svgCanvas.mergeAllLayers();
            window.updateContextPanel();
            this.setState(this.state);
        }

        renameLayer = () => {
            const drawing = svgCanvas.getCurrentDrawing();
            const oldName = drawing.getCurrentLayerName();
            $.prompt(LANG.notification.enterNewLayerName, '', (newName) => {
                if (!newName) {
                    return;
                }
                if (oldName === newName || svgCanvas.getCurrentDrawing().hasLayer(newName)) {
                    Alert.popUp({
                        id: 'old_layer_name',
                        message: LANG.notification.layerHasThatName,
                    });
                    return;
                }

                svgCanvas.renameCurrentLayer(newName);
                this.cloneLayerLaserConfig(oldName, newName);
                this.setState(this.state);
            });
        }

        moveLayerRel = (pos) => {
            const drawing = svgCanvas.getCurrentDrawing();
            const layerCount = drawing.getNumLayers();
            let curIndex = drawing.getCurrentLayerPosition();
            if (curIndex > 0 || curIndex < layerCount - 1) {
                curIndex += pos;
                svgCanvas.setCurrentLayerPosition(curIndex);
                this.setState(this.state);
            }
        }

        moveToOtherLayer = (e) => {
            const select = e.target;
            const destLayer = select.options[select.selectedIndex].value;
            const drawing = svgCanvas.getCurrentDrawing();
            const confirmStr = LANG.notification.QmoveElemsToLayer.replace('%s', destLayer);

            const moveToLayer = (ok) => {
                if (!ok) {
                    return;
                }
                this.promptMoveLayerOnce = true;
                svgCanvas.moveSelectedToLayer(destLayer);
                drawing.setCurrentLayer(destLayer);
                this.setState(this.state);
                svgCanvas.clearSelection();
            };
            if (destLayer) {
                if (this.promptMoveLayerOnce) {
                    moveToLayer(true);
                } else {
                    Alert.popUp({
                        id: 'move layer',
                        buttonType: AlertConstants.YES_NO,
                        message: confirmStr,
                        onYes: moveToLayer
                    });
                }
            }
        }

        selectLayer = (layerName) => {
            const drawing = svgCanvas.getCurrentDrawing();
            const res = drawing.setCurrentLayer(layerName);
            if (res) {
                svgCanvas.clearSelection();
                this.renderLayerLaserConfigs();
                svgCanvas.selectAllInCurrentLayer();
                this.setState(this.state);
            }
        }

        highlightLayer = function (layerName) {
            let i, curNames = [];
            const numLayers = svgCanvas.getCurrentDrawing().getNumLayers();
            for (i = 0; i < numLayers; i++) {
                curNames[i] = svgCanvas.getCurrentDrawing().getLayerName(i);
            }

            if (layerName) {
                for (i = 0; i < numLayers; ++i) {
                    if (curNames[i] !== layerName) {
                        svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 0.5);
                    }
                }
            } else {
                for (i = 0; i < numLayers; ++i) {
                    svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 1.0);
                }
            }
        };

        setLayerVisibility = (layerName) => {
            const drawing = svgCanvas.getCurrentDrawing();
            const isVis = drawing.getLayerVisibility(layerName);
            svgCanvas.setLayerVisibility(layerName, !isVis);
            this.setState(this.state);
        }

        unLockLayer = (e, layerName) => {
            const drawing = svgCanvas.getCurrentDrawing();
            let node = e.target;
            while(node.tagName.toLowerCase() !== 'tr') {
                node = node.parentNode;
            }
            $(node).removeClass('lock');
            const layer = drawing.getLayerByName(layerName);
            svgCanvas.unlockLayer(layer);
        }

        openLayerColorPanel = (e, layerName) => {
            const drawing = svgCanvas.getCurrentDrawing();
            const layer = drawing.getLayerByName(layerName);
            const node = e.target;
            ColorPickerPanel.init('color_picker_placeholder', layer, $(node), () => {this.setState(this.state)});
            ColorPickerPanel.setPosition(e.clientX, e.clientY)
            ColorPickerPanel.render();
            ColorPickerPanel.renderPickr();
        }

        layerDragStart = (layerName) => {
            this.draggingLayer = layerName;
        }

        layerDragEnter = (layerName) => {
            this.draggingDest = layerName;
        }

        layerDragEnd = () => {
            if (this.draggingLayer !== this.draggingDest) {
                const drawing = svgCanvas.getCurrentDrawing();
                drawing.setCurrentLayer(this.draggingLayer);
                const layerCount = drawing.getNumLayers();
                let destId = 0;
                for(destId; destId < layerCount; destId++) {
                    if (drawing.getLayerName(destId) === this.draggingDest) {
                        break;
                    }
                }
                svgCanvas.setCurrentLayerPosition(destId);
                this.setState(this.state);
            }
            this.draggingLayer = null;
        }

        layerDoubleClick = (layerName) => {
            this.renameLayer();
        }

        renderLayerList = () => {
            svgCanvas.clearSelection();
            const layers = [];
            const drawing = svgCanvas.getCurrentDrawing();
            const layerCount = drawing.getNumLayers();
            const currentLayerName = drawing.getCurrentLayerName();
            for (let i = layerCount - 1; i >= 0; i--) {
                const layerName = drawing.getLayerName(i);
                const layer = drawing.getLayerByName(layerName);
                const isLocked = layer.getAttribute('data-lock') === 'true';
                layers.push(
                    <tr 
                        key={i}
                        className={classNames('layer', {'layersel': layerName === currentLayerName, 'lock': isLocked})}
                        onMouseUp={() => this.selectLayer(layerName)}
                        onMouseOver={() => this.highlightLayer(layerName)}
                        onMouseOut={() => this.highlightLayer()}
                        draggable={true}
                        onDragStart={(e) => {this.layerDragStart(layerName)}}
                        onDragEnter={(e) => {this.layerDragEnter(layerName)}}
                        onDragEnd={(e) => {this.layerDragEnd()}}
                    >
                        <td
                            className='layercolor'
                            onClick={(e) => {this.openLayerColorPanel(e, layerName)}}
                        >
                            <div style={{backgroundColor: drawing.getLayerColor(layerName)}}/>
                        </td>
                        <td className='layername' onDoubleClick={() => this.layerDoubleClick(layerName)}>{layerName}</td>
                        <td 
                            className={classNames('layervis', {'layerinvis': !drawing.getLayerVisibility(layerName)})}
                            onClick={() => {this.setLayerVisibility(layerName)}}
                        >
                            <i className="fa fa-eye"></i>
                        </td>
                        <td className='layerlock' onClick={isLocked ? (e) => this.unLockLayer(e, layerName) : this.highlightLayer(layerName)}>
                            <img src='img/icon-lock.svg'/>
                        </td>
                    </tr>
                );
            }
            this.renderLayerLaserConfigs();
            return (
                <table id="layerlist">
                    <tbody>
                        {layers}
                    </tbody>
                </table>
            );
        }

        renderSelLayerBlock = () => {
            const options = [];
            const drawing = svgCanvas.getCurrentDrawing();
            const layerCount = svgCanvas.getCurrentDrawing().getNumLayers();
            const currentLayerName = drawing.getCurrentLayerName();
            for (let i = layerCount - 1; i >= 0; i--) {
                const layerName = drawing.getLayerName(i);
                options.push(
                    <option value={layerName} key={i}>{layerName}</option>
                );
            }

            return (
                <div className='selLayerBlock controls'>
                    <span id="selLayerLabel">Move elements to:</span>
                    <select
                        value={currentLayerName}
                        id="selLayerNames"
                        title="Move selected elements to a different layer"
                        disabled="disabled"
                        onChange={(e) => this.moveToOtherLayer(e)}
                    >
                        {options}
                    </select>
                </div>
            );
        }

        render() {
            const { ContextMenu, MenuItem, ContextMenuTrigger } = require('react-contextmenu');
            if (!window.svgCanvas) {
                setTimeout(() => {
                    this.setState(this.state);
                }, 50);
                return null;
            }
            return (
                <div id="layerpanel" onMouseOut={() => this.highlightLayer()}>
                    <fieldset id="layerbuttons">
                        <div id="layer_new" className="layer_button" title="New Layer" onClick={this.addNewLayer}>
                            <i className="fa fa-plus" />
                        </div>
                        <div id="layer_delete" className="layer_button" title="Delete Layer" onClick={this.deleteLayer}>
                            <i className="fa fa-trash-o" />
                        </div>
                        <div id="layer_rename" className="layer_button" title="Rename Layer" onClick={this.renameLayer}>
                            <i className="fa fa-font" />
                        </div>
                        <div id="layer_up" className="layer_button" title="Move Layer Up" onClick={() => {this.moveLayerRel(1)}}>
                            <i className="fa fa-arrow-up" />
                        </div>
                        <div id="layer_down" className="layer_button" title="Move Layer Down" onClick={() => {this.moveLayerRel(-1)}}>
                            <i className="fa fa-arrow-down" />
                        </div>
                        <ContextMenuTrigger id="layer-contextmenu" holdToDisplay={0}>
                            <div id="layer_moreopts" className="layer_button" title="More Options">
                                <i className="fa fa-bars" />
                            </div>
                        </ContextMenuTrigger>
                    </fieldset>
                    <ContextMenuTrigger id="layer-contextmenu" holdToDisplay={-1}>
                        <div id="layerlist_container">
                            <div id="color_picker_placeholder"></div>
                            {this.renderLayerList()}
                        </div>
                    </ContextMenuTrigger>
                    {this.renderSelLayerBlock()}

                    <ContextMenu id="layer-contextmenu">
                        <MenuItem onClick={this.cloneLayer}>{LANG.layers.dupe}</MenuItem>
                        <MenuItem onClick={this.lockLayer}>{LANG.layers.lock}</MenuItem>
                        <MenuItem onClick={this.mergeLayer}>{LANG.layers.merge_down}</MenuItem>
                        <MenuItem onClick={this.mergeAllLayer}>{LANG.layers.merge_all}</MenuItem>
                    </ContextMenu>
                </div>
            );
        }
    } 

    return LayerPanel;
});
