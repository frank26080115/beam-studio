define([
    'jsx!widgets/Modal',
    'helpers/i18n',
], function (
    Modal,
    i18n
) {
    'use strict';
    const React = require('react');

    const lang = i18n.lang.initialize;

    return function () {
        return class SelectConnectionType extends React.Component{

            onClick = (method) => {
                switch (method) {
                    case 'wi-fi':
                        location.hash = '#initialize/connect/connect-wi-fi';
                        break;
                    case 'wired':
                        location.hash = '#initialize/connect/connect-wired';
                        break;
                    case 'ether2ether':
                        location.hash = '#initialize/connect/connect-ethernet';
                        break;
                }
                //location.hash = '#initialize/connect/connect-beamo';
            }

            renderSelectConnectTypeStep = () => {
                return (
                    <div className="select-connection-type">
                        <h1 className="main-title">{lang.select_connection_type}</h1>
                        <div className="btn-h-group">
                            <div className="btn-container">
                                <img className="connect-btn-icon" src="img/init-panel/icon-wifi.svg" draggable="false"/>
                                <button
                                    className="btn btn-action"
                                    onClick={() => this.onClick('wi-fi')}
                                >
                                    {lang.connection_types.wifi}
                                </button>
                            </div>
                            <div className="btn-container">
                                <img className="connect-btn-icon" src="img/init-panel/icon-wired.svg" draggable="false"/>
                                <button
                                    className="btn btn-action"
                                    onClick={() => this.onClick('wired')}
                                >
                                    {lang.connection_types.wired}
                                </button>
                            </div>
                            <div className="btn-container">
                                <img className="connect-btn-icon" src="img/init-panel/icon-e2e.svg" draggable="false"/>
                                <button
                                    className="btn btn-action"
                                    onClick={() => this.onClick('ether2ether')}
                                >
                                    {lang.connection_types.ether_to_ether}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            renderBackButton = () => {
                return (
                    <div className="btn-page back" onClick={() => {location.hash='#initialize/connect/select-machine-type'}} >
                        <div className="left-arrow"/>
                        {lang.back}
                    </div>
                );
            }

            render() {
                const wrapperClassName = {
                    'initialization': true
                };
                const innerContent = this.renderSelectConnectTypeStep();
                const content = (
                    <div className="connect-machine">
                        <div className="top-bar"/>
                        {this.renderBackButton()}
                        {innerContent}
                    </div>
                );

                return (
                    <Modal className={wrapperClassName} content={content} />
                );
            }

        };
    };
});
