"use strict";

const Topic = require('./mqtt/Topic.js');
const Log = require('./Log.js');
const EventHandler = require('./EventHandler.js');

class DeviceManager {

    constructor({ api }) {
        this.api = api;

        this.onAdd = new EventHandler('Device.add');
        this.onRemove = new EventHandler('Device.remove');
        this.onUpdate = new EventHandler('Device.update');
    }

    getDeviceId(device) {

        if (!device) return undefined;
        if (device) {
            if (typeof device === 'string') {
                if (this.deviceIds && this.deviceIds.has(device))
                    return device;
                if (this.deviceNames && this.deviceNames.has(device))
                    return this.deviceNames.get(device);
                if (this.deviceTopics && this.deviceTopics.has(device))
                    return this.deviceTopics.get(device);
            } else if (typeof device === 'object') {
                if (device.id)
                    return device.id;
                if (device.name) {
                    if (this.deviceNames && this.deviceNames.has(device.name))
                        return this.deviceNames.get(device.name);
                    if (this.deviceTopics && this.deviceTopics.has(device.name))
                        return this.deviceTopics.get(device.name);
                }
            }
        }

        Log.error("Device id not found");
        Log.debug(device);

        return undefined;
    }

    getDeviceName(device) {
        // from device info
        if (typeof device === 'object' && device.name) {
            return Topic.normalize(device.name);
        }

        // from mapping
        if (!this.deviceIds) return undefined;
        const id = this.getDeviceId(device);
        return this.deviceIds.get(id);
    }

    getDeviceTopic(device) {
        if (!this.deviceTopicIds) return undefined;
        const id = this.getDeviceId(device);
        return this.deviceTopicIds.get(id);
    }

    async getDeviceById(deviceId) {
        if (deviceId) {
            const device = await this.api.devices.getDevice({ id: deviceId });
            if (!device) {
                Log.error("Device not found: " + deviceId);
            }
            return device;
        }
        Log.error("No device id provided");
        return undefined;
    }

    // TODO: optimize
    async getDeviceByName(device) {
        const id = this.getDeviceId(device);
        return await this.getDeviceById(id);
    }

    // TODO: optimize
    async getDeviceByTopic(device) {
        const id = this.getDeviceId(device);
        return await this.getDeviceById(id);
    }

    async getDevice(device) {
        const id = this.getDeviceId(device);
        return await this.getDeviceById(id);
    }

    isRegistered(device) {
        if (!this.deviceIds) return false;
        const id = this.getDeviceId(device);
        return id && this.deviceIds.has(id);
    }

    async register() {

        // Subscribe to realtime events and set all devices global
        this.api.devices.on('device.create', this._addDevice.bind(this));
        this.api.devices.on('device.delete', this._removeDevice.bind(this));
        this.api.devices.on('device.update', this._updateDevice.bind(this));

        this.devices = await this.api.devices.getDevices();
        if (this.devices) {
            for (let key in this.devices) {
                if (Array.isArray(this.devices) || this.devices.hasOwnProperty(key)) {
                    await this.registerDevice(this.devices[key]);
                }
            }
        }
    }

    async unregister() { }

    async registerDevice(device) {
        if (typeof device === 'object') {

            if (!device.id) {
                Log.error("[SKIP] No device id provided");
                return;
            }

            const deviceName = (device.name || '').trim();
            if (!deviceName) {
                Log.error("[SKIP] No device name provided");
                return;
            }

            if (this.isRegistered(device)) {
                Log.debug('device already registered');
                return;
            }

            this.deviceIds = this.deviceIds || new Map();           // id => name
            this.deviceNames = this.deviceNames || new Map();       // name => id
            this.deviceTopicIds = this.deviceTopicIds || new Map(); // id => topic
            this.deviceTopics = this.deviceTopics || new Map();     // topic => id

            const deviceTopic = Topic.normalize(deviceName);
            Log.info(deviceName + ': ' + deviceTopic);

            this.deviceIds.set(device.id, deviceName);
            this.deviceNames.set(deviceName, device.id);

            if (deviceTopic) {
                this.deviceTopicIds.set(device.id, deviceTopic);
                this.deviceTopics.set(deviceTopic, device.id);
            }
        }
    }

    async _addDevice(id) {
        Log.info('New device found!');
        
        const device = await this.getDeviceById(id);
        if (device) {
            this.devices = this.devices || [];
            if (!this.devices.find(device)) {
                this.devices.push(device);
            }
            await this.registerDevice(device);
            await this.onAdd.emit(device);
        } else {
            Log.warning('Device not found: ' + id);
        }
    }

    async _removeDevice(id) {

        const deviceName = this.getDeviceName(id);
        const deviceTopic = this.getDeviceTopic(id);

        if (this.deviceIds) this.deviceIds.delete(id);
        if (this.deviceTopicIds) this.deviceIds.delete(id);
        if (deviceName && this.deviceNames) this.deviceNames.delete(deviceName);
        if (deviceTopic && this.deviceTopics) this.deviceTopics.delete(deviceTopic);

        if (this.devices) {
            this.devices = this.devices.filter(d => d.id !== id);
        }

        await this.onRemove.emit(id);
    }

    async _updateDevice(id) {
        await this.onUpdate.emit(id);
    }

    async getCapabillities(device) {
        device = await this.getDevice(device);
        return device ? device.capabilitiesObj || device.capabilities : undefined; // 1.5.13 vs 2.0
    }

    async getCapability(device, capabilityId) {
        const capabillities = this.getCapabillities(device);
        return capabillities ? capabillities[capabilityId] : undefined;
    }
}

module.exports = DeviceManager;
