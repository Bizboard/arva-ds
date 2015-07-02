/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Hans van den Akker (mysim1)
 @license MIT
 @copyright Bizboard, 2015

 */

import {Provide}                    from 'di';
import {ObjectHelper}               from 'arva-utils/ObjectHelper';
import {DataSource}                 from '../core/DataSource';
import {SharePointSnapshot}         from './SharePoint/SharePointSnapshot';
import {SharePoint}                 from 'SPSoapAdapter/SharePoint';
import {UrlParser}                  from 'arva-utils/request/UrlParser';

@Provide(DataSource)
export class SharePointDataSource extends DataSource {

    /** @param {String} path **/
    constructor(path, options = {}) {
        super(path);

        this._dataReference = null;
        this._onValueCallback = null;
        this._onAddCallback = null;
        this._onChangeCallback = null;
        this._onMoveCallback = null;
        this._onRemoveCallback = null;
        this._orginialPath = path;
        this.options = options;

        /* Bind all local methods to the current object instance, so we can refer to "this"
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Hide all private properties (starting with '_') and methods from enumeration,
         * so when you do for( in ), only actual data properties show up. */
        ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);

        /* Hide the priority field from enumeration, so we don't save it to the dataSource. */
        ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'length');


        // don't initialize this datasource when there is no path selected to
        // retrieve data from.
        if (this.key().length > 0) {
            let configuration = {
                endPoint: this._orginialPath,
                listName: this.key()
            };

            if (this.options.query) {
                configuration.query = this.options.query;
            }

            if (this.options.orderBy) {
                configuration.orderBy = this.options.orderBy;
            }

            if (this.options.limit) {
                configuration.limit = this.options.limit;
            }

            // bind the soap adapter against the datasource with configuration
            this._dataReference = new SharePoint(configuration);
        }
    }

    _notifyOnValue(snapshot) {
        if (this._onValueCallback) {
            this._onValueCallback(snapshot);
        }
    }

    _ParseSelector(path, endPoint) {

    }

    _ParsePath(path, endPoint) {

        var url = UrlParser(path);
        if (!url) console.log("Invalid datasource path provided!");

        var pathParts = url.path.split('/');
        var newPath = url.protocol + "://" + url.host + "/";
        for (var i = 0; i < pathParts.length; i++)
            newPath += pathParts[i] + "/";
        newPath += endPoint;
        return newPath;
    }

;


    /**
     * Indicate that the DataSource can be inherited when instantiating a list of models.
     * @returns {boolean}
     */
    get inheritable() {
        return true;
    }

    /**
     * Returns a datasource reference to the given child branch of the current datasouce.
     * @param {String} childName
     */
    child(childName) {
        let childPath = '';
        if (childName.indexOf('http')>-1) {
            childPath = childName.substring(1);
        }
        else {
            childPath += this._orginialPath + '/' + childName;
        }

        if (this.options) {
            return new SharePointDataSource(childPath, this.options);
        }
        else {
            return new SharePointDataSource(childPath);
        }
    }

    root() {
        return '';
    }

    /**
     * Returns the full URL to the path on the datasource.
     */
    path() {
        return this._orginialPath;
    }

    toString() {
        return this._orginialPath;
    }

    /**
     * Returns the name of the current branch in the path on the datasource.
     */
    key() {
        var url = UrlParser(this._orginialPath);
        if (!url) console.log("Invalid datasource path provided!");

        if (url.path.length == 0) return "";
        var pathElements = url.path.split('/');
        if (pathElements.length == 1) return url.path;
        else return url.path.split('/').pop();
    }

    /**
     * Writes newData to the path this dataSource was constructed with.
     * @param {Object} newData
     */
    set(newData) {
        this._dataReference.set(newData);
        return this._dataReference;
    }

    /**
     * Removes the object and all underlying children that this dataSource points to.
     */
    remove(object) {
        this._dataReference.remove(newData);
    }

    /**
     * Writes newData to the path this dataSource was constructed with, appended by a random UID generated by
     * the dataSource.
     * @param {Object} newData
     */
    push(newData) {
        return this.set(newData);
    }

    /**
     * Writes newData with given priority (ordering) to the path this dataSource was constructed with.
     * @param {Object} newData
     * @param {String|Number} priority
     */
    setWithPriority(newData, priority) {
        newData.priority = priority;
        this.set(newData);
    }

    /**
     * Sets the priority (ordering) of an object on a given dataSource.
     * @param {String|Number} newPriority
     */
    setPriority(newPriority) {
    }

    /** Sets the callback triggered when dataSource updates the data.
     *  @param {Function} callback **/
    setValueChangedCallback(callback) {
        this._onValueCallback = callback;

        let wrapper = (data) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            this._onValueCallback(newChildSnapshot);
        };
        this._dataReference.on('value', wrapper.bind(this));
    }

    /** Removes the callback set to trigger when dataSource updates the data. **/
    removeValueChangedCallback() {
        if (this._onValueCallback) {
            this._dataReference.off('value', this._onValueCallback);
            this._onValueCallback = null;
        }
    }

    /** Set the callback triggered when dataSource adds a data element.
     * @param {Function} callback **/
    setChildAddedCallback(callback) {
        this._onAddCallback = callback;

        let wrapper = (data, previousSiblingId) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            this._onAddCallback(newChildSnapshot, previousSiblingId);
        };
        this._dataReference.on('child_added', wrapper.bind(this));
    }

    /** Removes the callback set to trigger when dataSource adds a data element. **/
    removeChildAddedCallback() {
        if (this._onAddCallback) {
            this._dataReference.off('child_added', this._onAddCallback);
            this._onAddCallback = null;
        }
    }

    /** Set the callback triggered when dataSource changes a data element.
     * @param {Function} callback **/
    setChildChangedCallback(callback) {
        this._onChangeCallback = callback;

        let wrapper = (data, previousSiblingId) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            this._onChangeCallback(newChildSnapshot, previousSiblingId);
        };
        this._dataReference.on('child_changed', wrapper.bind(this));
    }

    /** Removes the callback set to trigger when dataSource changes a data element. **/
    removeChildChangedCallback() {
        if (this._onChangeCallback) {
            this._dataReference.off('child_changed', this._onChangeCallback);
            this._onChangeCallback = null;
        }
    }

    /** Set the callback triggered when dataSource moves a data element.
     * @param {Function} callback **/
    setChildMovedCallback(callback) {
    }

    /** Removes the callback set to trigger when dataSource moves a data element. **/
    removeChildMovedCallback() {
    }

    /** Set the callback triggered when dataSource adds a data element.
     * @param {Function} callback **/
    setChildRemovedCallback(callback) {
        this._onRemoveCallback = callback;

        let wrapper = (data) => {
            let removedChildSnapshot = new SharePointSnapshot(data, this);
            this._onRemoveCallback(removedChildSnapshot);
        };

        this._dataReference.on('child_removed', wrapper.bind(this));
    }

    /** Removes the callback set to trigger when dataSource adds a data element. **/
    removeChildRemovedCallback() {
        if (this._onRemoveCallback) {
            this._dataReference.off('child_removed', this._onRemoveCallback);
            this._onRemoveCallback = null;
        }
    }
}