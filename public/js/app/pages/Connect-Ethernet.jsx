define([
    'jsx!widgets/Modal',
    'helpers/i18n',
], function (
    Modal,
    i18n
) {
    'use strict';
    const React = require('react');
    const classNames = require('classnames');

    const lang = i18n.lang.initialize;

    return function () {
        return class ConnectEthernet extends React.Component{
            constructor(props) {
                super(props);
                this.state = {
                    showCollapse: false,
                };
            }

            renderContent = () => {
                const guideHref = process.platform === 'darwin' ? lang.connect_ethernet.tutorial2_a_href_mac : lang.connect_ethernet.tutorial2_a_href_win
                return (
                    <div className="connection-ethernet">
                        <div className="image-container ether">
                            <div className="circle c1" />
                            <img className="ethernet-icon" src="img/init-panel/icon-dual-cable.svg" draggable="false"/>
                            <div className="circle c2" />
                        </div>
                        <div className="text-container">
                            <div className="title">{lang.connect_ethernet.title}</div>
                            <div className="contents tutorial">
                                <div>{lang.connect_ethernet.tutorial1}</div>
                                <div>
                                    {lang.connect_ethernet.tutorial2_1}
                                    <a target="_blank" href={guideHref}>{lang.connect_ethernet.tutorial2_a_text}</a>
                                    {lang.connect_ethernet.tutorial2_2}
                                </div>
                                <div>{lang.connect_ethernet.tutorial3}</div>
                            </div>
                            {this.renderNextButton()}
                        </div>
                    </div>
                );
            }

            renderBackButton = () => {
                return (
                    <div className="btn-page back" onClick={() => {location.hash='#initialize/connect/select-connection-type'}} >
                        <div className="left-arrow"/>
                        {lang.back}
                    </div>
                );
            }

            renderNextButton = () => {
                return (
                    <div className="btn-page next" onClick={() => {location.hash='#initialize/connect/connect-machine-ip?wired=1'}} >
                        <div className="right-arrow"/>
                        {lang.next}
                    </div>
                );
            }

            render() {
                const wrapperClassName = {
                    'initialization': true
                };
                const innerContent = this.renderContent();
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
