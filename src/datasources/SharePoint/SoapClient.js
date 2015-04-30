/**
 This Source Code is licensed under the MIT license. If a copy of the
 MIT-license was not distributed with this file, You can obtain one at:
 http://opensource.org/licenses/mit-license.html.

 @author: Hans van den Akker (mysim1)
 @license MIT
 @copyright Bizboard, 2015

 */

import XML2JS               from './xml2js'
import _                    from 'lodash'
import {PostRequest}        from '../../components/RequestClient'
import ObjectHelper         from '../../utils/objectHelper'
import {ParseStringToXml}   from '../../components/XmlParser'


export class SoapClient {

    constructor() {

        /* Bind all local methods to the current object instance, so we can refer to "this"
         * in the methods as expected, even when they're called from event handlers.        */
        ObjectHelper.bindAllMethods(this, this);

        /* Hide all private properties (starting with '_') and methods from enumeration,
         * so when you do for( in ), only actual data properties show up. */
        ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);

        /* Hide the priority field from enumeration, so we don't save it to the dataSource. */
        ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'length');
    }

    _applySoapTemplate(properties) {
        return _.template('<?xml version="1.0" encoding="utf-8"?>' +
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


    _serializeParams(params) {
        if (!params||params.length==0) return "";
        var data = { "root": params };
        var creator = new XML2JS();
        var payload = creator.json2xml_str(data);

        return payload.replace("<root>","").replace("</root>","");
    }

    _handleError(error) {
        return "Error!";
    }


    _handleSuccess(data) {
        var nodes, node, rootnode, name,
            NODE_ELEMENT = 1,
            attributes, attribute,
            results = [], result,
            root = '',
            i, j;


        if (typeof(data.selectSingleNode) != "undefined")
            rootnode = data.selectSingleNode("//rs:data");
        else
            rootnode = data.querySelector("data");


        // handle like GetListItems
        if (rootnode) {
            nodes = rootnode.childNodes;
        } else {
            if (typeof(data.selectSingleNode) != "undefined") {
                rootnode = data.selectSingleNode("//Result");
                nodes = rootnode.selectNodes("//row");
            }
            else {
                rootnode = data.querySelector("Result");
                nodes = rootnode.querySelectorAll("row");
            }
        }


        for (i = 0; i < nodes.length; i += 1) {
            node = nodes[i];

            // skip text nodes
            if (node.nodeType === NODE_ELEMENT) {
                attributes = node.attributes;
                result = {};
                for (j = 0; j < attributes.length; j += 1) {

                    attribute = attributes[j];
                    name = attribute.name.replace('ows_', '');
                    if (name=="ID"){
                        name="id";
                        result[name] = attribute.value;
                    }

                    /*
                    if (attribute.value.indexOf(";#")>-1) {
                        var keys = attribute.value.split(";#");
                        var pairs = keys.length/2;
                        var assignable = pairs.length>1?[]:{};
                        for(var pair=0;pair<pairs;pair++){
                            if (pairs>1) assignable.push({ id: keys[pair], value: keys[pair+1]});
                            else assignable = {id: keys[pair], value: keys[pair+1]};
                        }
                        result[name] = { id: 0, value: ""};
                    }*/

                    // map a number when that number is detected
                    else if (!isNaN(attribute.value))
                        result[name] = parseFloat(attribute.value);
                    // default map 1-1
                    else
                        result[name] = attribute.value;
                }
                // only use the result if it is not hidden
                if ((result.Hidden || '').toUpperCase() !== "TRUE") {
                    results.push(result);
                }

            }
        }

        return results;
    }


    call(config) {

        var request;
        config = config || {};

        request = {
            url     : config.url,
            headers : config.headers,
            data    : this._applySoapTemplate({
                method: config.method,
                params: this._serializeParams(config.params)
            })
        };

        var context = this;
        // Make the request.
        return new Promise(function(resolve, reject) {

            PostRequest(request)
                .then(function(response){
                    var xmlDocument = ParseStringToXml(response);
                    resolve(context._handleSuccess(xmlDocument));
                    // process data

                }, function(error){
                    reject(context._handleError(error));
                });
        });
    }




}