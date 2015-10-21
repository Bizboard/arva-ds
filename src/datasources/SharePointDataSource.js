/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Hans van den Akker (mysim1)
 @license MIT
 @copyright Bizboard, 2015

 */

import {provide}                    from 'di';
import {ObjectHelper}               from 'arva-utils/ObjectHelper.js';
import {UrlParser}                  from 'arva-utils/request/UrlParser.js';
import {DataSource}                 from '../core/DataSource.js';
import {SharePoint}                 from 'SPSoapAdapter/SharePoint.js';
import {SharePointSnapshot}         from './SharePoint/SharePointSnapshot.js';

@provide(DataSource)
export class SharePointDataSource extends DataSource {

    /**
     * @param {String} path Full path to resource in remote data storage.
     * @return {SharePointDataSource} SharePointDataSource instance.
     **/
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

        /* Bind all local methods to the current object instance, so we can refer to 'this'
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Don't initialize this datasource when there is no path selected to retrieve data from. */
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

            /* Bind the soap adapter against the datasource with given configuration */
            this._dataReference = new SharePoint(configuration);
        }
    }

    /**
     * Indicate that the DataSource can be inherited when instantiating a list of models. By
     * default we indicate false, which should trigger data model instantiation to create unique
     * DataSource references to each model either in array or directly.
     *
     * If set to false, model updates trigger creation of a new DataSource instance. (default)
     *
     * @returns {Boolean} Whether the DataSource is inheritable.
     */
    get inheritable() {
        return true;
    }

    /**
     * Returns the full path to this dataSource's source on the remote storage provider.
     * @returns {String} Full resource path.
     */
    toString() {
        return this._orginialPath;
    }

    /**
     * Returns a dataSource reference to the given child branch of the current dataSource.
     * @param {String} childName Child branch name.
     * @param {Object} options Optional: additional options to pass to new DataSource instance.
     * @returns {DataSource} New dataSource instance pointing to the given child branch.
     */
    child(childName, options = null) {
        let childPath = '';
        if (childName.indexOf('http') !== -1) {
            childPath = childName.substring(1);
        } else {
            childPath += this._orginialPath + '/' + childName;
        }

        return new SharePointDataSource(childPath, options || this.options);
    }

    /**
     * Returns the full URL to the path on the dataSource. Functionally identical to toString().
     * @returns {String} Full resource path.
     */
    path() {
        return this._orginialPath;
    }

    /**
     * Returns the name of the current branch in the path on the dataSource.
     * @returns {String} Current branch name.
     */
    key() {
        var url = UrlParser(this._orginialPath);
        if (!url) { console.log('Invalid datasource path provided!'); }

        if (url.path.length === 0) { return ''; }
        var pathElements = url.path.split('/');
        if (pathElements.length === 1) {
            return url.path;
        } else {
            return url.path.split('/').pop();
        }
    }

    /**
     * Writes newData to the path this dataSource was constructed with.
     * @param {Object} newData Data to write to dataSource.
     * @returns {void}
     */
    set(newData) {
        this._dataReference.set(newData);
        return this;
    }

    /**
     * Removes the object and all underlying children that this dataSource points to.
     * @param {Object} object The current object, needed because of a SharePointDataSource-specific issue. Will be refactored out in the future.
     * @returns {void}
     */
    remove(object) {
        this._dataReference.remove(object);
    }

    /**
     * Writes newData to the path this dataSource was constructed with, appended by a random UID generated by
     * the dataSource.
     * @param {Object} newData New data to append to dataSource.
     * @returns {void}
     */
    push(newData) {
        let pushedData = this._dataReference.set(newData);
        return new SharePointDataSource(this.path()).child(`${pushedData['_temporary-identifier']}`);
    }

    /**
     * Writes newData with given priority (ordering) to the path this dataSource was constructed with.
     * @param {Object} newData New data to set.
     * @param {String|Number} priority Priority value by which the data should be ordered.
     * @returns {void}
     */
    setWithPriority(newData, priority) {
        newData.priority = priority;
        this.set(newData);
    }

    /**
     * Sets the priority (ordering) of an object on a given dataSource.
     * @param {String|Number} newPriority New priority value to order data by.
     * @returns {void}
     */
    setPriority(newPriority) { throw new Error('Not implemented'); }

    /**
     * Returns a new dataSource reference that will limit the subscription to only the first given amount items.
     * @param {Number} amount Amount of items to limit the dataSource to.
     * @returns {DataSource} New dataSource instance.
     */
    limitToFirst(amount) { throw new Error('Not implemented'); }

    /**
     * Returns a new dataSource reference that will limit the subscription to only the last given amount items.
     * @param {Number} amount Amount of items to limit the dataSource to.
     * @returns {DataSource} New dataSource instance.
     */
    limitToLast(amount) { throw new Error('Not implemented'); }

    /**
     * Authenticates all instances of this DataSource with the given OAuth provider and credentials.
     * @param {String} provider google, facebook, github, or twitter
     * @param {String|Object} credentials Access token string, or object with key/value pairs with e.g. OAuth 1.1 credentials.
     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
     * On error, first argument is error message.
     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
     * @returns {void}
     */
    authWithOAuthToken(provider, credentials, onComplete, options) { throw new Error('Not implemented'); }

    /**
     * Authenticates all instances of this DataSource with a custom auth token or secret.
     * @param {String} authToken Authentication token or secret.
     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
     * On error, first argument is error message.
     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
     * @returns {void}
     */
    authWithCustomToken(authToken, onComplete, options) { throw new Error('Not implemented'); }

    /**
     * Authenticates all instances of this DataSource with the given email/password credentials.
     * @param {String|Object} credentials Object with key/value pairs {email: 'value', password:'value'}.
     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
     * On error, first argument is error message.
     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
     * @returns {void}
     */
    authWithPassword(credentials, onComplete, options) { throw new Error('Not implemented'); }

    /**
     * Authenticates all instances of this DataSource as an anonymous user.
     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
     * On error, first argument is error message.
     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
     * @returns {void}
     */
    authAnonymously(onComplete, options) { throw new Error('Not implemented'); }

    /**
     * Fetches the current user's authentication state.
     * If the user is authenticated, returns an object containing at least the fields uid, provider, auth, and expires.
     * If the user is not authenticated, returns null.
     * @returns {Object|null} User auth object.
     */
    getAuth() { throw new Error('Not implemented'); }

    /**
     * Logs out from the datasource, allowing to re-authenticate at a later time.
     * @returns {void}
     */
    unauth() { throw new Error('Not implemented'); }

    /**
     * Sets the callback triggered when dataSource updates the data.
     * @param {Function} callback Callback function to call when the subscribed data value changes.
     * @returns {void}
     **/
    setValueChangedCallback(callback) {
        this._onValueCallback = (data) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            callback(newChildSnapshot);
        };
        this._dataReference.on('value', this._onValueCallback);
    }

    /**
     * Removes the callback set to trigger when dataSource updates the data.
     * @returns {void}
     **/
    removeValueChangedCallback() {
        if (this._onValueCallback) {
            this._dataReference.off('value', this._onValueCallback);
            this._onValueCallback = null;
        }
    }

    /**
     * Set the callback triggered when dataSource adds a data element.
     * @param {Function} callback Callback function to call when a new data child is added.
     * @returns {void}
     **/
    setChildAddedCallback(callback) {
        this._onAddCallback = (data, previousSiblingId) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            callback(newChildSnapshot, previousSiblingId);
        };
        this._dataReference.on('child_added', this._onAddCallback);
    }

    /**
     * Removes the callback set to trigger when dataSource adds a data element.
     * @returns {void}
     **/
    removeChildAddedCallback() {
        if (this._onAddCallback) {
            this._dataReference.off('child_added', this._onAddCallback);
            this._onAddCallback = null;
        }
    }

    /**
     * Set the callback triggered when dataSource changes a data element.
     * @param {Function} callback Callback function to call when a child is changed.
     * @returns {void}
     **/
    setChildChangedCallback(callback) {
        this._onChangeCallback = (data, previousSiblingId) => {
            let newChildSnapshot = new SharePointSnapshot(data, this);
            callback(newChildSnapshot, previousSiblingId);
        };
        this._dataReference.on('child_changed', this._onChangeCallback);
    }

    /**
     * Removes the callback set to trigger when dataSource changes a data element.
     * @returns {void}
     **/
    removeChildChangedCallback() {
        if (this._onChangeCallback) {
            this._dataReference.off('child_changed', this._onChangeCallback);
            this._onChangeCallback = null;
        }
    }

    /**
     * Set the callback triggered when dataSource moves a data element.
     * @param {Function} callback Callback function to call when a child is moved.
     * @returns {void}
     **/
    setChildMovedCallback(callback) {
        console.warn('Not implemented');
    }

    /**
     * Removes the callback set to trigger when dataSource moves a data element.
     * @returns {void}
     **/
    removeChildMovedCallback() {
        console.warn('Not implemented');
    }

    /**
     * Set the callback triggered when dataSource removes a data element.
     * @param {Function} callback Callback function to call when a child is removed.
     * @returns {void}
     **/
    setChildRemovedCallback(callback) {
        this._onRemoveCallback = (data) => {
            let removedChildSnapshot = new SharePointSnapshot(data, this);
            callback(removedChildSnapshot);
        };

        this._dataReference.on('child_removed', this._onRemoveCallback);
    }

    /**
     * Removes the callback set to trigger when dataSource removes a data element.
     * @returns {void}
     **/
    removeChildRemovedCallback() {
        if (this._onRemoveCallback) {
            this._dataReference.off('child_removed', this._onRemoveCallback);
            this._onRemoveCallback = null;
        }
    }

    /**
     * Dummy method that just returns an empty string.
     * @returns {String} Empty string.
     */
    root() {
        return '';
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
        if (!url) { console.log('Invalid datasource path provided!'); }

        var pathParts = url.path.split('/');
        var newPath = url.protocol + '://' + url.host + '/';
        for (var i = 0; i < pathParts.length; i++) {
            newPath += pathParts[i] + '/';
        }
        newPath += endPoint;
        return newPath;
    }
}