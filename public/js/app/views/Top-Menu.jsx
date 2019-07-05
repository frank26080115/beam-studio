define([
    'jquery',
    'react',
    'helpers/i18n',
    'app/app-settings',
    'helpers/api/discover',
    'helpers/device-master',
    'helpers/check-device-status',
    'helpers/check-firmware',
    'helpers/firmware-updater',
    'helpers/firmware-version-checker',
    'helpers/api/cloud',
    'helpers/output-error',
    'plugins/classnames/index',
    'app/constants/device-constants',
    'jsx!views/toolbox/Toolbox',
    'app/actions/alert-actions',
    'app/stores/alert-store',
    'app/actions/global-actions',
    'app/stores/global-store',
    'helpers/device-list',
    'app/actions/progress-actions',
    'app/constants/progress-constants',
    'app/constants/global-constants',
    'app/actions/initialize-machine',
    'app/actions/beambox/preview-mode-background-drawer',
    'app/actions/beambox/preview-mode-controller',
    'app/actions/beambox/svgeditor-function-wrapper'
], function (
    $,
    React,
    i18n,
    appSettings,
    Discover,
    DeviceMaster,
    checkDeviceStatus,
    checkFirmware,
    firmwareUpdater,
    FirmwareVersionChecker,
    CloudApi,
    OutputError,
    ClassNames,
    DeviceConstants,
    Toolbox,
    AlertActions,
    AlertStore,
    GlobalActions,
    GlobalStore,
    DeviceList,
    ProgressActions,
    ProgressConstants,
    GlobalConstants,
    InitializeMachine,
    PreviewModeBackgroundDrawer,
    PreviewModeController,
    FnWrapper
) {
    'use strict';

    if (window["electron"]) {
        var { ipc, events } = window.electron;
    } else {
        const EM = require('events');
        var ipc = new EM();
        var events = {};
    }

    return function (args) {
        args = args || {};
        var _id = 'TopMenu',
            lang = args.state.lang,
            
            getLog = async function (printer, log) {
                await DeviceMaster.select(printer);
                ProgressActions.open(ProgressConstants.WAITING, '');
                let downloader = DeviceMaster.downloadLog(log);
                downloader.then((file) => {
                    ProgressActions.close();
                    saveAs(file[1], log);

                }).progress((progress) => {
                    ProgressActions.open(ProgressConstants.STEPPING);
                    ProgressActions.updating(
                        'downloading',
                        progress.completed / progress.size * 100,
                        function () { downloader.reject('canceled'); }
                    );

                }).fail((data) => {
                    let msg = data === 'canceled' ?
                        lang.device.download_log_canceled : lang.device.download_log_error;
                    AlertActions.showPopupInfo('', msg);
                });
            },

            executeFirmwareUpdate = function (printer, type) {
                //var currentPrinter = discoverMethods.getLatestPrinter(printer),
                var currentPrinter = printer,
                    checkToolheadFirmware = function () {
                        var $deferred = $.Deferred();

                        ProgressActions.open(ProgressConstants.NONSTOP, lang.update.checkingHeadinfo);

                        if ('toolhead' === type) {
                            DeviceMaster.headInfo().done(function (response) {
                                currentPrinter.toolhead_version = response.version || '';

                                if ('undefined' === typeof response.version) {
                                    $deferred.reject();
                                }
                                else {
                                    $deferred.resolve({ status: 'ok' });
                                }
                            }).fail(() => {
                                $deferred.reject();
                            });
                        }
                        else {
                            $deferred.resolve({ status: 'ok' });
                        }

                        return $deferred;
                    },
                    updateFirmware = function () {
                        checkFirmware(currentPrinter, type).done(function (response) {
                            var latestVersion = currentPrinter.version,
                                caption = lang.update.firmware.latest_firmware.caption,
                                message = lang.update.firmware.latest_firmware.message;

                            if ('toolhead' === type) {
                                latestVersion = currentPrinter.toolhead_version;
                                caption = lang.update.toolhead.latest_firmware.caption;
                                message = lang.update.toolhead.latest_firmware.message;
                            }

                            if (!response.needUpdate) {
                                let forceUpdate = {
                                    custom: () => {
                                        firmwareUpdater(response, currentPrinter, type, true);
                                    },
                                    no: () => {
                                        if ('toolhead' === type) {
                                            DeviceMaster.quitTask();
                                        }
                                    }
                                };
                                AlertActions.showPopupCustomCancel(
                                    'latest-firmware',
                                    message + ' (v' + latestVersion + ')',
                                    lang.update.firmware.latest_firmware.still_update,
                                    caption,
                                    forceUpdate
                                );
                            } else {
                                firmwareUpdater(response, currentPrinter, type);
                            }

                        })
                            .fail(function (response) {
                                firmwareUpdater(response, currentPrinter, type);
                                AlertActions.showPopupInfo(
                                    'latest-firmware',
                                    lang.monitor.cant_get_toolhead_version
                                );
                            });
                    },
                    checkStatus = function () {
                        const processUpdate = () => {
                            checkToolheadFirmware().always(function () {
                                ProgressActions.close();
                                updateFirmware();
                            }).fail(function () {
                                AlertActions.showPopupError('toolhead-offline', lang.monitor.cant_get_toolhead_version);
                            });
                        };

                        const handleYes = (id) => {
                            if (id === 'head-missing') {
                                processUpdate();
                            }
                        };

                        const handleCancel = (id) => {
                            if (id === 'head-missing') {
                                AlertStore.removeYesListener(handleYes);
                                AlertStore.removeCancelListener(handleCancel);
                                DeviceMaster.endMaintainMode();
                            }
                        };

                        AlertStore.onRetry(handleYes);
                        AlertStore.onCancel(handleCancel);

                        ProgressActions.open(ProgressConstants.NONSTOP, lang.update.preparing);
                        if (type === 'toolhead') {
                            DeviceMaster.enterMaintainMode().then(() => {
                                setTimeout(() => {
                                    ProgressActions.close();
                                    processUpdate();
                                }, 3000);
                            });
                        }
                        else {
                            processUpdate();
                        }
                    };


                DeviceMaster.select(printer).then(function (status) {
                    checkStatus();
                }).fail((resp) => {
                    AlertActions.showPopupError('menu-item', lang.message.connectionTimeout);
                });
            };

        const registerAllDeviceMenuClickEvents = () => {

            window.menuEventRegistered = true;

            const showPopup = async (currentPrinter, type) => {

                const allowPause = await FirmwareVersionChecker.check(currentPrinter, 'OPERATE_DURING_PAUSE');
                const status = await checkDeviceStatus(currentPrinter, allowPause);
                switch (status) {
                    case 'ok':
                        if (type === 'SET_TEMPERATURE') {
                            AlertActions.showHeadTemperature(currentPrinter);
                        }
                        else {
                            AlertActions.showChangeFilament(currentPrinter);
                        }
                        break;
                    case 'auth':
                        let callback = {
                            onSuccess: function () {
                                AlertActions.showChangeFilament(currentPrinter);
                            },
                            onError: function () {
                                InputLightboxActions.open('auth-device', {
                                    type: InputLightboxConstants.TYPE_PASSWORD,
                                    caption: lang.select_printer.notification,
                                    inputHeader: lang.select_printer.please_enter_password,
                                    confirmText: lang.select_printer.submit,
                                    onSubmit: function (password) {
                                        _auth(printer.uuid, password, {
                                            onError: function (response) {
                                                var message = (
                                                    false === response.reachable ?
                                                        lang.select_printer.unable_to_connect :
                                                        lang.select_printer.auth_failure
                                                );
                                                AlertActions.showPopupError('device-auth-fail', message);
                                            }
                                        });
                                    }
                                });
                            }
                        };
                        _auth(currentPrinter.uuid, '', callback);
                        break;
                }
            };

            ipc.on(events.MENU_CLICK, (e, menuItem) => {
                let _action = {},
                    lang = i18n.get();

                _action['DASHBOARD'] = (device) => {
                    DeviceMaster.selectDevice(device).then(status => {
                        if (status === DeviceConstants.CONNECTED) {
                            GlobalActions.showMonitor(device, '', '', GlobalConstants.DEVICE_LIST);
                        }
                        else if (status === DeviceConstants.TIMEOUT) {
                            AlertActions.showPopupError('menu-item', lang.message.connectionTimeout);
                        }
                    });
                };

                _action['MACHINE_INFO'] = (device) => {
                    let info = `${lang.device.model_name}: ${device.model.toUpperCase()}\n${lang.device.IP}: ${device.ipaddr}\n${lang.device.serial_number}: ${device.serial}\n${lang.device.firmware_version}: ${device.version}\n${lang.device.UUID}: ${device.uuid}`;
                    AlertActions.showPopupInfo('', info);
                };

                _action['CALIBRATE_BEAMBOX_CAMERA'] = (device) => {
                    if (location.hash !== '#studio/beambox') {
                        AlertActions.showPopupInfo('', lang.camera_calibration.please_goto_beambox_first);
                        return;
                    }
                    ProgressActions.open(ProgressConstants.NONSTOP, lang.message.connecting);
                    DeviceMaster.select(device)
                        .done(() => {
                            ProgressActions.close();
                            AlertActions.showCameraCalibration(device);
                        })
                        .fail(() => {
                            ProgressActions.close();
                            AlertActions.showPopupError('menu-item', lang.message.connectionTimeout);
                        });
                };

                _action['UPDATE_FIRMWARE'] = (device) => {
                    checkDeviceStatus(device).then(() => {
                        executeFirmwareUpdate(device, 'firmware');
                    });
                };

                _action['UPDATE_TOOLHEAD'] = (device) => {
                    checkDeviceStatus(device).then(() => {
                        executeFirmwareUpdate(device, 'toolhead');
                    });
                };

                _action['LOG_NETWORK'] = (device) => {
                    getLog(device, 'fluxnetworkd.log');
                };

                _action['LOG_HARDWARE'] = (device) => {
                    getLog(device, 'fluxhald.log');
                };

                _action['LOG_DISCOVER'] = (device) => {
                    getLog(device, 'fluxupnpd.log');
                };

                _action['LOG_USB'] = (device) => {
                    getLog(device, 'fluxusbd.log');
                };

                _action['LOG_CAMERA'] = (device) => {
                    getLog(device, 'fluxcamerad.log');
                };

                _action['LOG_CLOUD'] = (device) => {
                    getLog(device, 'fluxcloudd.log');
                };

                _action['LOG_PLAYER'] = (device) => {
                    getLog(device, 'fluxplayerd.log');
                };

                _action['LOG_ROBOT'] = (device) => {
                    getLog(device, 'fluxrobotd.log');
                };

                _action['SET_AS_DEFAULT'] = (device) => {
                    InitializeMachine.defaultPrinter.clear();
                    InitializeMachine.defaultPrinter.set(device);
                    ipc.send(events.SET_AS_DEFAULT, device);
                };

                _action['BUG_REPORT'] = () => {
                    OutputError();
                };

                _action['SIGN_IN'] = () => {
                    location.hash = '#studio/cloud/sign-in';
                };

                _action['SIGN_OUT'] = () => {
                    CloudApi.signOut().then(() => {
                        location.hash = '#studio/cloud/sign-in';
                    });
                };

                _action['MY_ACCOUNT'] = () => {
                    location.hash = '#studio/cloud/bind-machine';
                };

                if (typeof _action[menuItem.id] === 'function') {
                    if (
                        menuItem.id === 'SIGN_IN' ||
                            menuItem.id === 'SIGN_OUT' ||
                            menuItem.id === 'MY_ACCOUNT' ||
                            menuItem.id === 'BUG_REPORT'
                    ) {
                        _action[menuItem.id]();
                    }
                    else {
                        let callback = {
                            timeout: 20000,
                            onSuccess: (device) => { _action[menuItem.id](device); },
                            onTimeout: () => { console.log('select device timeout'); }
                        };

                        DeviceMaster.getDeviceBySerial(menuItem.serial, menuItem.source === 'h2h', callback);
                    }
                }
            });

        };

        const unregisterEvents = () => {
            let { ipc, events } = window.electron;
            ipc.removeAllListeners(events.MENU_CLICK);
        };

        if (!window.menuEventRegistered) {
            registerAllDeviceMenuClickEvents();
        }
        // registerMenuItemClickEvents();

        return React.createClass({

            getDefaultProps: function () {
                return {
                    show: true
                };
            },

            getInitialState: function () {
                return {
                    sourceId: '',
                    deviceList: [],
                    refresh: '',
                    showDeviceList: false,
                    customText: '',
                    fcode: {},
                    previewUrl: ''
                };
            },

            componentDidMount: function () {
                this._toggleDeviceListBind = this._toggleDeviceList.bind(null, false);

                AlertStore.onCancel(this._toggleDeviceListBind);
                AlertStore.onRetry(this._waitForPrinters);
                GlobalStore.onMonitorClosed(this._toggleDeviceListBind);

            },

            componentWillUnmount: function () {
                AlertStore.removeCancelListener(this._toggleDeviceListBind);
                AlertStore.removeRetryListener(this._waitForPrinters);
                GlobalStore.removeMonitorClosedListener(this._toggleDeviceListBind);
                // unregisterEvents();
            },

            _waitForPrinters: function () {
                setTimeout(this._openAlertWithnoPrinters, 5000);
            },

            _openAlertWithnoPrinters: function () {
                if (0 === this.state.deviceList.length && true === this.state.showDeviceList) {
                    if (location.hash === '#studio/beambox') {
                        AlertActions.showPopupRetry('no-printer', lang.device_selection.no_beambox);
                    } else {
                        AlertActions.showPopupRetry('no-printer', lang.device_selection.no_printers);
                    }
                }
            },

            _toggleDeviceList: function (open) {
                this.setState({
                    showDeviceList: open
                });

                if (open) {
                    this._waitForPrinters();
                }
            },

            _handleNavigation: function (address) {
                if (-1 < appSettings.needWebGL.indexOf(address) && false === detectWebgl()) {
                    AlertActions.showPopupError('no-webgl-support', lang.support.no_webgl);
                }
                else {
                    if (location.hash.indexOf('beambox') > 0 && address !== 'beambox') {
                        FnWrapper.clearSelection();
                        PreviewModeController.end();
                        PreviewModeBackgroundDrawer.clear();
                    }

                    location.hash = '#studio/' + address;
                }
            },

            _handleShowDeviceList: function () {
                var self = this,
                    refreshOption = function (devices) {
                        self.setState({
                            deviceList: devices
                        });
                    };
                console.log("Discover", Discover);
                Discover(
                    'top-menu',
                    function (printers) {
                        printers = DeviceList(printers);
                        refreshOption(printers);
                    }
                );

                this._toggleDeviceList(!this.state.showDeviceList);
            },

            _handleSelectDevice: function (device, e) {
                e.preventDefault();
                AlertStore.removeCancelListener(this._toggleDeviceListBind);
                ProgressActions.open(ProgressConstants.NONSTOP_WITH_MESSAGE, lang.initialize.connecting);
                DeviceMaster.selectDevice(device).then(function (status) {
                    if (status === DeviceConstants.CONNECTED) {
                        ProgressActions.close();
                        GlobalActions.showMonitor(device);
                    }
                    else if (status === DeviceConstants.TIMEOUT) {
                        ProgressActions.close();
                        AlertActions.showPopupError(_id, lang.message.connectionTimeout);
                    }
                })
                    .fail(function (status) {
                        ProgressActions.close();
                        AlertActions.showPopupError('fatal-occurred', status);
                    });

                this._toggleDeviceList(false);
            },

            _handleMonitorClose: function () {
                this.setState({
                    showMonitor: false
                });
            },

            _handleContextMenu: function (event) {
                electron && electron.ipc.send("POPUP_MENU_ITEM", { x: event.screenX, y: event.screenY }, {});
            },

            _renderDeviceList: function () {
                var status = lang.machine_status,
                    headModule = lang.head_module,
                    statusText,
                    headText,
                    progress,
                    deviceList = this.state.deviceList,
                    options = deviceList.map(function (device) {
                        statusText = status[device.st_id] || status.UNKNOWN;
                        headText = headModule[device.head_module] || headModule.UNKNOWN;

                        if (device.st_prog === 0) {
                            progress = '';
                        }
                        else if (16 === device.st_id && 'number' === typeof device.st_prog) {
                            progress = (parseInt(device.st_prog * 1000) * 0.1).toFixed(1) + '%';
                        }
                        else {
                            progress = '';
                        }

                        let img = `img/icon_${device.source === 'h2h' ? 'usb' : 'wifi'}.svg`;

                        return (
                            <li
                                key={device.uuid}
                                name={device.uuid}
                                onClick={this._handleSelectDevice.bind(null, device)}
                                data-test-key={device.serial}
                            >
                                <label className="name">{device.name}</label>
                                <label className="status">{headText} {statusText}</label>
                                <label className="progress">{progress}</label>
                                <label className="connection-type">
                                    <div className="type">
                                        <img src={img} />
                                    </div>
                                </label>
                            </li>
                        );
                    }, this),
                    list;

                list = (
                    0 < options.length
                        ? options :
                        [<div key="spinner-roller" className="spinner-roller spinner-roller-reverse" />]
                );

                return (
                    <ul>{list}</ul>
                );
            },

            _renderTopBtn: function(iconName, label) {
                return (
                    <div className="top-btn">
                        <img src={`img/top-menu/icon-${iconName}.svg`} onError={(e)=>{e.target.onerror = null; e.target.src=`img/top-menu/icon-${iconName}.png`}} />
                        <div className="btn-label">
                            {label}
                        </div>
                    </div>
                );
            },

            render: function () {
                let deviceList = this._renderDeviceList(),
                    menuClass,
                    topClass;

                menuClass = ClassNames('menu', { show: this.state.showDeviceList });
                topClass = {
                    'hide': !this.props.show
                };

                return (
                    <div className={ClassNames(topClass)}>
                        <div className="top-btns">
                            <div className="top-controls zoom-controls">
                                {this._renderTopBtn('zoom', 'Zoom')}
                            </div>
                            <div className="top-controls group-controls">
                                {this._renderTopBtn('group', 'Group')}
                                {this._renderTopBtn('ungroup', 'Ungroup')}
                            </div>
                            <div className="top-controls align-controls">
                                {this._renderTopBtn('align-h', 'H-Align')}
                                {this._renderTopBtn('align-v', 'V-Align')}
                                {this._renderTopBtn('dist-h', 'H-Dist')}
                                {this._renderTopBtn('dist-v', 'V-Dist')}
                            </div>
                            <div className="top-controls clip-controls">
                                {this._renderTopBtn('union', 'Union')}
                                {this._renderTopBtn('subtract', 'Subtract')}
                                {this._renderTopBtn('intersect', 'Intersect')}
                                {this._renderTopBtn('difference', 'Difference')}
                            </div>

                            <div className="top-controls flip-controls">
                                {this._renderTopBtn('h-flip', 'H-Flip')}
                                {this._renderTopBtn('v-flip', 'V-Flip')}
                            </div>
                        </div>

                        <div title={lang.print.deviceTitle} className="device" onClick={this._handleShowDeviceList}>
                            <p className="device-icon">
                                <img src="img/btn-device.svg" draggable="false" />
                                <span>{lang.menu.device}</span>
                            </p>
                            <div className={menuClass}>
                                <div className="arrow arrow-right" />
                                <div className="device-list">
                                    {deviceList}
                                </div>
                            </div>
                        </div>
                        <Toolbox />
                    </div>
                );
            }

        });
    };
});
