/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Hans van den Akker (mysim1)
 @license MIT
 @copyright Bizboard, 2015

 */

import _                    from 'lodash';
import XML2JS               from './xml2js';
import {PostRequest}        from 'arva-utils/request/RequestClient';
import {ObjectHelper}       from 'arva-utils/ObjectHelper';
import {UrlParser}          from 'arva-utils/request/UrlParser';
import {ParseStringToXml}   from 'arva-utils/request/XmlParser';


export class DataModelGenerator {

    constructor(originalPath, schema) {

        // initialize the arguments
        if (!schema) throw 'Schema wasn\'t provided.';
        if (schema && schema.Prefix)  {
            this._applicationId = schema.Prefix;
        }

        this.hidden = 'TRUE';
        this._originalPath = originalPath;
        this._Schema = schema.Schema;
        this._Seed = schema.Seed;

        // if the dataspec contains an instruction 'hidden' have this setting override the default
        if (schema &&
            typeof schema.hidden == 'boolean') {
            this.hidden = schema.hidden.toString().toUpperCase();
        }

        /* Bind all local methods to the current object instance, so we can refer to 'this'
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Hide all private properties (starting with '_') and methods from enumeration,
         * so when you do for( in ), only actual data properties show up. */
        ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);
    }

    Deploy() {
        if (!this._Schema) throw 'There is no schema to deploy.';
        var listOfPromisesToFullfill = [];

        return new Promise((resolve, reject)=> {

            // iterate through all tables listed.
            for (let table in this._Schema) {

                let tableCreator = this._GetOrCreateList(table)
                    .then(function (result) {
                        var fields = this._Schema[table];
                        if (fields && fields.length>0) {
                            return this._GetOrCreateModel(table, fields, result);
                        }
                        return Promise.resolve();
                    }.bind(this));

                listOfPromisesToFullfill.push(tableCreator);
            }

            // wait for all deploy actions to complete before we tell the Deploy
            // context to return control;
            Promise.all(listOfPromisesToFullfill)
                .then(results=> {
                    resolve(results);
                }, error =>{
                    reject(error);
                });
        });
    }

    Seed() {
        if (!this._Seed) throw 'There is no seed to deploy.';



    }


    _getListExistRequest(listName) {
        // rough configuration object
        let params = {
            listName: listName
        };

        return {
            url     : this._ParsePath(this._originalPath, this._GetListService),
            headers : new Map([
                ['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/GetList'],
                ['Content-Type', 'text/xml']
            ]),
            data    : this._applySoapTemplate({
                method: 'GetList',
                params: this._serializeParams(params)
            })
        };
    }

    _getListCreationRequest(listName, listDescription) {
        // rough configuration object
        let params = {
                listName: listName,
                description: listDescription,
                templateID: '100'
        };

        return {
            url     : this._ParsePath(this._originalPath, this._GetListService),
            headers : new Map([
                ['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/AddList'],
                ['Content-Type', 'text/xml']
            ]),
            data    : this._applySoapTemplate({
                method: 'AddList',
                params: this._serializeParams(params)
            })
        };
    }

    _getListUpdateRequest(params) {

        return {
            url     : this._ParsePath(this._originalPath, this._GetListService),
            headers : new Map([
                ['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/UpdateList'],
                ['Content-Type', 'text/xml']
            ]),
            data    : this._applySoapTemplate({
                method: 'UpdateList',
                params: this._serializeParams(params)
            })
        };
    }

    /**
     *
     * @param listName
     * @param description
     * @returns {Promise}
     * @constructor
     */
    _GetOrCreateList(listName, description = '') {

        let existingListRequest = this._getListExistRequest(listName);

        return new Promise((resolve, reject)=> {

            PostRequest(existingListRequest)
                .then(
                (result)=> {
                    // exists, so let's return handle
                    resolve(result.response);
                },
                (error) => {
                    // exists, so let's create
                    let newListRequest = this._getListCreationRequest(listName, description);

                    PostRequest(newListRequest)
                        .then(
                        (result)=> {
                            resolve(result.response);
                        },
                        (error) => {
                            reject(error);
                        });
                });
        });
    }

    _GetOrCreateModel(listName, modelDescription, listData) {

        let listOfLookups = [];
        // rough configuration object
        let params = {
            listName: listName,
            newFields: {
                Fields : {
                    Method: []
                }
            },
            listProperties: {
                List: {
                    _Hidden: this.hidden,
                    _EnableAttachments: 'FALSE'
                }
            }
        };

        for (let i=0;i<modelDescription.length;i++) {
            let internalName = modelDescription[i].name;
            if (this._applicationId) internalName = this._applicationId + '_' + internalName;
            if (listData.indexOf(internalName)!=-1) continue;

            // handle Lookups differently
            if (modelDescription[i].type == 'Lookup' || modelDescription[i].type == 'LookupMulti') {
                let newLookup = this._CreateLookup(listName, internalName, modelDescription[i].type, modelDescription[i].source);
                listOfLookups.push(newLookup);
            } else {
                // handle simple types

                var modelData = {
                    '_ID': i,
                    Field: {
                        '_Type': modelDescription[i].type,
                        '_DisplayName': internalName,
                        '_FromBaseType': 'TRUE'
                    }
                };
                params.newFields.Fields.Method.push(modelData);
            }
        }

        let updateListRequest = this._getListUpdateRequest(params);

        return new Promise((resolve, reject)=> {

            if (params.newFields.Fields.Method.length==0) {
                resolve('No action taken.');
            } else {
                PostRequest(updateListRequest)

                    // end with creation of all simple field types
                    .then((result) => {
                        return Promise.all(listOfLookups);
                    },

                    (error) => {
                        reject(error);
                    })

                    // end with resolving all lookup creations
                    .then((result) => {
                            resolve(result.response);
                        }, (error) => {
                            reject(result);
                        });
            }
        });
    }

    _CreateLookup(listName, fieldName, type, sourceName) {

        return this._GetOrCreateList(sourceName)
            .then((result)=> {
                let listId = this._ResolveListID(result);

                // rough configuration object
                let params = {
                    listName: listName,
                    newFields: {
                        Fields: {
                            Method: [{
                                '_ID': 1,
                                Field: {
                                    '_Type': type,
                                    '_DisplayName': fieldName,
                                    '_FromBaseType': 'TRUE',
                                    '_ShowField': 'Title',
                                    '_List': listId,
                                    '_Mult': type === 'LookupMulti' ? 'TRUE' : 'FALSE'
                                }
                            }]
                        }
                    }
                };

                let updateListRequest = this._getListUpdateRequest(params);

                return new Promise((resolve, reject)=> {

                    PostRequest(updateListRequest)
                        .then(
                        (result)=> {
                            // TODO: rename the fields to the real
                            resolve(result);
                        },
                        (error) => {
                            reject(error);
                        });
                });
            });
    }


    _ResolveListID(response) {

        let data = ParseStringToXml(response);
        let idNode;


        if (typeof(data.selectSingleNode) != 'undefined')
            idNode = data.selectSingleNode('//List');
        else
            idNode = data.querySelector('List');

        let idAttribute = '';
        if (idNode) idAttribute = idNode.getAttribute('ID');

        return idAttribute;
    }


    _applySoapTemplate(properties) {
        return _.template(
            '<?xml version="1.0" encoding="utf-8"?>' +
            '<soap:Envelope ' +
            '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            '  xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
            '  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                '<soap:Body>' +
                    '<<%= method %> xmlns="http://schemas.microsoft.com/sharepoint/soap/">' +
                    '<%= params %>' +
                    '</<%= method %>>' +
                '</soap:Body>' +
            '</soap:Envelope>')(properties);
    }

    get _GetListService() {
        return '_vti_bin/Lists.asmx';
    }



    _ParsePath(path, endPoint) {
        var url = UrlParser(path);
        if (!url) console.log('Invalid datasource path provided!');

        var pathParts = url.path.split('/');
        var newPath = url.protocol + '://' + url.host + '/';
        for(var i=0;i<pathParts.length;i++)
            newPath += pathParts[i] + '/';
        newPath += endPoint;
        return newPath;
    }

    _serializeParams(params) {
        if (!params||params.length==0) return '';
        var data = { root: params };
        var creator = new XML2JS();
        var payload = creator.json2xml_str(data);

        return payload.replace('<root>','').replace('</root>','');
    }
}
