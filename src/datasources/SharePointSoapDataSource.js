/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Hans van den Akker (mysim1)
 @license MIT
 @copyright Bizboard, 2015

 */

import Firebase                     from 'firebase';
import {Provide}                    from 'di.js';
import {ObjectHelper}               from 'arva-utils/ObjectHelper';
import {DataSource}                 from '../core/DataSource';
import {SoapClient}                 from './SharePoint/SoapClient';
import {UrlParser}                  from 'arva-utils/request/UrlParser';
import {SharePointSnapshot}         from './SharePoint/SharePointSnapshot';

@Provide(DataSource)
export class SharePointSoapDataSource extends DataSource {

    /** @param {String} path **/
    constructor(path, credentials) {
        super(path);

        this._dataReference = null;
        this._onValueCallback = null;
        this._onAddCallback = null;
        this._onChangeCallback = null;
        this._onMoveCallback = null;
        this._onRemoveCallback = null;
        this._credentials = credentials;
        this._orginialPath = path;

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
        if (this.key().length==0) return;

        // bind the soap adapter against the datasource with configuration
        this._dataReference = new SoapClient();

        // go fetch some data
        this._updateDataSource();

    }

    _updateDataSource() {
        var configuration = this._GetListItemsDefaultConfiguration;

        configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
        configuration.params = {
            "listName": this.key(),
            //"viewName": '',
            //"viewFields": {
            //    "ViewFields": viewFieldsData
            //},
            "queryOptions": {
                "QueryOptions": {
                    "IncludeMandatoryColumns": "FALSE",
                    "ViewAttributes": {
                        "_Scope": "RecursiveAll"
                    }
                }
            }
        };


        // initial initialisation of the datasource
        this._dataReference.call(configuration)
            .then((data)=>{
                // parse the json results push them somewhere
                let snapshot = new SharePointSnapshot(data, this);
                this._notifyOnValue(snapshot);

            }, (error) =>{
                console.log(error);
            });
    }

    _notifyOnValue(snapshot) {
        if(this._onValueCallback) {
            this._onValueCallback(snapshot);
        }
    }

    _ParsePath(path, endPoint) {
        var url = UrlParser(path);
        if (!url) console.log("Invalid datasource path provided!");

        var pathParts = url.path.split('/');
        var newPath = url.protocol + "://" + url.host + "/";
        for(var i=0;i<pathParts.length-1;i++)
            newPath += pathParts[i] + "/";
        newPath += endPoint;
        return newPath;
    };


    /**
     * Indicate that the DataSource can be inherited when instantiating a list of models.
     * @returns {boolean}
     */
    get inheritable() { return true; }

    /**
     * Returns a datasource reference to the given child branch of the current datasouce.
     * @param {String} childName
     */
    child(childName) {
        var newPath = this._orginialPath + "/" + childName;
        return new SharePointSoapDataSource(newPath);
    }

    /**
     * Returns the full URL to the path on the datasource.
     */
    path() {
        return this._orginialPath;
    }

    /**
     * Returns the name of the current branch in the path on the datasource.
     */
    key() {
        var url = UrlParser(this._orginialPath);
        if (!url) console.log("Invalid datasource path provided!");
        // 'base/list2'
        // 'base/site2/list3'
        // 'list2'
        // ''

        if (url.path.length==0) return "";
        var pathElements = url.path.split('/');
        if (pathElements.length==1) return url.path;
        else return url.path.split('/').pop();
    }

    /**
     * Writes newData to the path this dataSource was constructed with.
     * @param {Object} newData
     */
    set(newData) {

        var configuration = this._UpdateListItemsDefaultConfiguration;
        configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
        var fieldCollection = [];
        var method = '';
        var callback;

        // assume existing record to be updated.
        if (newData.id) {
            fieldCollection.push({
                "_Name": "ID",
                "__text": newData.id
            });

            method = "Update";
            callback = this._onChangeCallback;
        }
        // create a new record, because there is no id.
        else {
            fieldCollection.push({
                "_Name": "ID",
                "__text": 'New'
            });
            method = 'New';
            callback = this._onAddCallback;
        }

        for (var prop in newData) {
            if (prop == "id" || typeof(newData[prop]) == "undefined") continue;
            if (prop == "priority") continue;

            fieldCollection.push({
                "_Name": prop,
                "__text": newData[prop]
            });
        }

        configuration.params = {
            "listName": this.key(),
            "updates": {
                "Batch": {
                    "Method": {
                        "Field": fieldCollection,

                        "_ID": "1",
                        "_Cmd": method
                    },

                    "_OnError": "Continue",
                    "_ListVersion": "1",
                    "_ViewName": ""
                }
            }
        };

        // initial initialisation of the datasource
        this._dataReference.call(configuration)
            .then((result)=>{
                for (var data of result)
                {
                    // parse the json results push them somewhere
                    let snapshot = new SharePointSnapshot(data, this);
                    if (callback) callback(snapshot);
                }
            }, (error) =>{
                console.log(error);
            });

        return this;
    }

    /**
     * Removes the object and all underlying children that this dataSource points to.
     */
    remove(object) {
        var configuration = this._UpdateListItemsDefaultConfiguration;
        configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
        var fieldCollection = [];

        fieldCollection.push({
            "_Name": "ID",
            "__text": object.id
        });

        configuration.params = {
            "listName": this.key(),
            "updates": {
                "Batch": {
                    "Method": {
                        "Field": fieldCollection,

                        "_ID": '1',
                        "_Cmd": 'Delete'
                    },

                    "_OnError": 'Continue',
                    "_ListVersion": '1',
                    "_ViewName": ''
                }
            }
        };

        // initial initialisation of the datasource
        this._dataReference.call(configuration)
            .then(()=>{
                // parse the json results push them somewhere
                let snapshot = new SharePointSnapshot(null, this, {key:object.id, value:null});
                if (this._onRemoveCallback) this._onRemoveCallback(snapshot);
            }, (error) =>{
                console.log(error);
            });

        return this;
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
    setPriority(newPriority) { }

    /** Sets the callback triggered when dataSource updates the data.
     *  @param {Function} callback **/
    setValueChangedCallback(callback){
        this._onValueCallback = callback;
    }

    /** Removes the callback set to trigger when dataSource updates the data. **/
    removeValueChangedCallback() {
        this._onValueCallback = null;
    }

    /** Set the callback triggered when dataSource adds a data element.
     * @param {Function} callback **/
    setChildAddedCallback(callback) {
        this._onAddCallback = callback;
    }

    /** Removes the callback set to trigger when dataSource adds a data element. **/
    removeChildAddedCallback() {
        this._onAddCallback = null;
    }

    /** Set the callback triggered when dataSource changes a data element.
     * @param {Function} callback **/
    setChildChangedCallback(callback) {
        this._onChangeCallback = callback;
    }

    /** Removes the callback set to trigger when dataSource changes a data element. **/
    removeChildChangedCallback() {
        this._onChangeCallback = null;
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
    }

    /** Removes the callback set to trigger when dataSource adds a data element. **/
    removeChildRemovedCallback() {
        this._onRemoveCallback = null;
    }



    get _UpdateListItemsDefaultConfiguration() {
        return {
            url: '',
            service: 'Lists',
            method: 'UpdateListItems',
            params: '',
            headers: new Map([
                ['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/UpdateListItems'],
                ['Content-Type', 'text/xml']
            ])
        };
    }

    get _GetListItemsDefaultConfiguration() {
        return {
            url: '',
            service: 'Lists',
            method: 'GetListItems',
            params: '',
            headers: new Map([
                ['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/GetListItems'],
                ['Content-Type', 'text/xml']
            ])
        };
    }

    get _GetListService() {
        return '_vti_bin/Lists.asmx';
    }

    get _GetUserGroupService() {
        return '_vti_bin/UserGroup.asmx';
    }

}