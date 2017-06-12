
const electron = require('electron');
const {app, ipcMain, BrowserWindow} = require('electron');

require("./src/bootstrap.js");
const BackendManager = require('./src/backend-manager.js');
const MenuManager = require('./src/menu-manager.js');
const UglyNotify = require('./src/ugly-notify.js');
const events = require('./src/ipc-events');

const path = require('path');
const url = require('url');

let mainWindow;
let menuManager;

global.backend = {alive: false};
global.devices = {};


function onGhostUp(data) {
    global.backend = {alive: true, port: data.port};
    if(mainWindow) {
        mainWindow.webContents.send(events.BACKEND_UP, {port: data.port});
    }
}


function onGhostDown() {
    global.backend = {alive: false};
    if(mainWindow) {
        mainWindow.webContents.send('backend-down');
    }
}


function onDeviceUpdated(deviceInfo) {
    let origDeviceInfo = global.devices[deviceInfo.uuid];
    if(origDeviceInfo && origDeviceInfo.st_id !== null && origDeviceInfo.st_id !== deviceInfo.st_id) {
        switch(deviceInfo.st_id) {
            case 48:
                UglyNotify.send(deviceInfo.name, 'Is paused');
                break;
            case 64:
                UglyNotify.send(deviceInfo.name, 'Is completed!');
                break;
            case 128:
                UglyNotify.send(deviceInfo.name, 'Is aborted');
                break;
        }
    }

    if(mainWindow) {
        mainWindow.webContents.send('device-status', deviceInfo);
    }

    if(global.devices[deviceInfo.uuid]) {
        menuManager.updateDevice(deviceInfo.uuid, deviceInfo);
    } else {
        menuManager.appendDevice(deviceInfo.uuid, deviceInfo);
    }

    global.devices[deviceInfo.uuid] = deviceInfo;
}

const backendManager = new BackendManager({
    location: process.env.BACKEND,
    trace_pid: process.pid,
    on_ready: onGhostUp,
    on_device_updated: onDeviceUpdated,
    on_stderr: (data) => { console.log(`${data}`.trim()); },
    on_stopped: onGhostDown
});
backendManager.start();


function createWindow () {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 1024, height: 768, vibrancy: 'light'});

    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'public/index.html'),
        protocol: 'file:',
        slashes: true,
    }));

    mainWindow.on('closed', function () {
        mainWindow = null;

        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    mainWindow.webContents.openDevTools();
}

ipcMain.on(events.CHECK_BACKEND_STATUS, () => {
    if(mainWindow) {
        mainWindow.send(events.NOTIFY_BACKEND_STATUS, {
            backend: global.backend,
            devices: global.devices
        });
    } else {
        console.error('Recv async-status request but main window not exist');
    }
});

ipcMain.on('open-devtool', () => { mainWindow.webContents.openDevTools(); });
ipcMain.on('discover-poke', (ipaddr) => { backendManager.poke(ipaddr); });

app.on('ready', () => {
    app.makeSingleInstance((commandLine, workingDirectory) => {
        if(mainWindow === null) {
            createWindow();
        } else {
            mainWindow.focus();
        }
    });

    if(process.argv.indexOf('--debug') > 0) {
        require('electron-reload')(__dirname);
    }

    menuManager = new MenuManager();
    menuManager.on(events.MENU_ITEM_CLICK, (data) => {
        if(mainWindow) {
            mainWindow.webContents.send(events.MENU_CLICK, data);
        } else {
            console.log('Menu event triggered but window does not exist.');
        }
    });
    createWindow();
});


// app.on('window-all-closed', function () {
// });


app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow();
    }
});

app.on('before-quit', function() {
    backendManager.stop();
});
