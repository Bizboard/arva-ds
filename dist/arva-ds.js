(function(global) {
  'use strict';
  if (global.$traceurRuntime) {
    return ;
  }
  var $Object = Object;
  var $TypeError = TypeError;
  var $create = $Object.create;
  var $defineProperties = $Object.defineProperties;
  var $defineProperty = $Object.defineProperty;
  var $freeze = $Object.freeze;
  var $getOwnPropertyDescriptor = $Object.getOwnPropertyDescriptor;
  var $getOwnPropertyNames = $Object.getOwnPropertyNames;
  var $keys = $Object.keys;
  var $hasOwnProperty = $Object.prototype.hasOwnProperty;
  var $toString = $Object.prototype.toString;
  var $preventExtensions = Object.preventExtensions;
  var $seal = Object.seal;
  var $isExtensible = Object.isExtensible;
  var $apply = Function.prototype.call.bind(Function.prototype.apply);
  function $bind(operand, thisArg, args) {
    var argArray = [thisArg];
    for (var i = 0; i < args.length; i++) {
      argArray[i + 1] = args[i];
    }
    var func = $apply(Function.prototype.bind, operand, argArray);
    return func;
  }
  function $construct(func, argArray) {
    var object = new ($bind(func, null, argArray));
    return object;
  }
  var counter = 0;
  function newUniqueString() {
    return '__$' + Math.floor(Math.random() * 1e9) + '$' + ++counter + '$__';
  }
  var privateNames = $create(null);
  function isPrivateName(s) {
    return privateNames[s];
  }
  function createPrivateName() {
    var s = newUniqueString();
    privateNames[s] = true;
    return s;
  }
  var CONTINUATION_TYPE = Object.create(null);
  function createContinuation(operand, thisArg, argsArray) {
    return [CONTINUATION_TYPE, operand, thisArg, argsArray];
  }
  function isContinuation(object) {
    return object && object[0] === CONTINUATION_TYPE;
  }
  var isTailRecursiveName = null;
  function setupProperTailCalls() {
    isTailRecursiveName = createPrivateName();
    Function.prototype.call = initTailRecursiveFunction(function call(thisArg) {
      var result = tailCall(function(thisArg) {
        var argArray = [];
        for (var i = 1; i < arguments.length; ++i) {
          argArray[i - 1] = arguments[i];
        }
        var continuation = createContinuation(this, thisArg, argArray);
        return continuation;
      }, this, arguments);
      return result;
    });
    Function.prototype.apply = initTailRecursiveFunction(function apply(thisArg, argArray) {
      var result = tailCall(function(thisArg, argArray) {
        var continuation = createContinuation(this, thisArg, argArray);
        return continuation;
      }, this, arguments);
      return result;
    });
  }
  function initTailRecursiveFunction(func) {
    if (isTailRecursiveName === null) {
      setupProperTailCalls();
    }
    func[isTailRecursiveName] = true;
    return func;
  }
  function isTailRecursive(func) {
    return !!func[isTailRecursiveName];
  }
  function tailCall(func, thisArg, argArray) {
    var continuation = argArray[0];
    if (isContinuation(continuation)) {
      continuation = $apply(func, thisArg, continuation[3]);
      return continuation;
    }
    continuation = createContinuation(func, thisArg, argArray);
    while (true) {
      if (isTailRecursive(func)) {
        continuation = $apply(func, continuation[2], [continuation]);
      } else {
        continuation = $apply(func, continuation[2], continuation[3]);
      }
      if (!isContinuation(continuation)) {
        return continuation;
      }
      func = continuation[1];
    }
  }
  function construct() {
    var object;
    if (isTailRecursive(this)) {
      object = $construct(this, [createContinuation(null, null, arguments)]);
    } else {
      object = $construct(this, arguments);
    }
    return object;
  }
  var $traceurRuntime = {
    initTailRecursiveFunction: initTailRecursiveFunction,
    call: tailCall,
    continuation: createContinuation,
    construct: construct
  };
  (function() {
    function nonEnum(value) {
      return {
        configurable: true,
        enumerable: false,
        value: value,
        writable: true
      };
    }
    var method = nonEnum;
    var symbolInternalProperty = newUniqueString();
    var symbolDescriptionProperty = newUniqueString();
    var symbolDataProperty = newUniqueString();
    var symbolValues = $create(null);
    function isShimSymbol(symbol) {
      return typeof symbol === 'object' && symbol instanceof SymbolValue;
    }
    function typeOf(v) {
      if (isShimSymbol(v))
        return 'symbol';
      return typeof v;
    }
    function Symbol(description) {
      var value = new SymbolValue(description);
      if (!(this instanceof Symbol))
        return value;
      throw new TypeError('Symbol cannot be new\'ed');
    }
    $defineProperty(Symbol.prototype, 'constructor', nonEnum(Symbol));
    $defineProperty(Symbol.prototype, 'toString', method(function() {
      var symbolValue = this[symbolDataProperty];
      return symbolValue[symbolInternalProperty];
    }));
    $defineProperty(Symbol.prototype, 'valueOf', method(function() {
      var symbolValue = this[symbolDataProperty];
      if (!symbolValue)
        throw TypeError('Conversion from symbol to string');
      if (!getOption('symbols'))
        return symbolValue[symbolInternalProperty];
      return symbolValue;
    }));
    function SymbolValue(description) {
      var key = newUniqueString();
      $defineProperty(this, symbolDataProperty, {value: this});
      $defineProperty(this, symbolInternalProperty, {value: key});
      $defineProperty(this, symbolDescriptionProperty, {value: description});
      freeze(this);
      symbolValues[key] = this;
    }
    $defineProperty(SymbolValue.prototype, 'constructor', nonEnum(Symbol));
    $defineProperty(SymbolValue.prototype, 'toString', {
      value: Symbol.prototype.toString,
      enumerable: false
    });
    $defineProperty(SymbolValue.prototype, 'valueOf', {
      value: Symbol.prototype.valueOf,
      enumerable: false
    });
    var hashProperty = createPrivateName();
    var hashPropertyDescriptor = {value: undefined};
    var hashObjectProperties = {
      hash: {value: undefined},
      self: {value: undefined}
    };
    var hashCounter = 0;
    function getOwnHashObject(object) {
      var hashObject = object[hashProperty];
      if (hashObject && hashObject.self === object)
        return hashObject;
      if ($isExtensible(object)) {
        hashObjectProperties.hash.value = hashCounter++;
        hashObjectProperties.self.value = object;
        hashPropertyDescriptor.value = $create(null, hashObjectProperties);
        $defineProperty(object, hashProperty, hashPropertyDescriptor);
        return hashPropertyDescriptor.value;
      }
      return undefined;
    }
    function freeze(object) {
      getOwnHashObject(object);
      return $freeze.apply(this, arguments);
    }
    function preventExtensions(object) {
      getOwnHashObject(object);
      return $preventExtensions.apply(this, arguments);
    }
    function seal(object) {
      getOwnHashObject(object);
      return $seal.apply(this, arguments);
    }
    freeze(SymbolValue.prototype);
    function isSymbolString(s) {
      return symbolValues[s] || privateNames[s];
    }
    function toProperty(name) {
      if (isShimSymbol(name))
        return name[symbolInternalProperty];
      return name;
    }
    function removeSymbolKeys(array) {
      var rv = [];
      for (var i = 0; i < array.length; i++) {
        if (!isSymbolString(array[i])) {
          rv.push(array[i]);
        }
      }
      return rv;
    }
    function getOwnPropertyNames(object) {
      return removeSymbolKeys($getOwnPropertyNames(object));
    }
    function keys(object) {
      return removeSymbolKeys($keys(object));
    }
    function getOwnPropertySymbols(object) {
      var rv = [];
      var names = $getOwnPropertyNames(object);
      for (var i = 0; i < names.length; i++) {
        var symbol = symbolValues[names[i]];
        if (symbol) {
          rv.push(symbol);
        }
      }
      return rv;
    }
    function getOwnPropertyDescriptor(object, name) {
      return $getOwnPropertyDescriptor(object, toProperty(name));
    }
    function hasOwnProperty(name) {
      return $hasOwnProperty.call(this, toProperty(name));
    }
    function getOption(name) {
      return global.$traceurRuntime.options[name];
    }
    function defineProperty(object, name, descriptor) {
      if (isShimSymbol(name)) {
        name = name[symbolInternalProperty];
      }
      $defineProperty(object, name, descriptor);
      return object;
    }
    function polyfillObject(Object) {
      $defineProperty(Object, 'defineProperty', {value: defineProperty});
      $defineProperty(Object, 'getOwnPropertyNames', {value: getOwnPropertyNames});
      $defineProperty(Object, 'getOwnPropertyDescriptor', {value: getOwnPropertyDescriptor});
      $defineProperty(Object.prototype, 'hasOwnProperty', {value: hasOwnProperty});
      $defineProperty(Object, 'freeze', {value: freeze});
      $defineProperty(Object, 'preventExtensions', {value: preventExtensions});
      $defineProperty(Object, 'seal', {value: seal});
      $defineProperty(Object, 'keys', {value: keys});
    }
    function exportStar(object) {
      for (var i = 1; i < arguments.length; i++) {
        var names = $getOwnPropertyNames(arguments[i]);
        for (var j = 0; j < names.length; j++) {
          var name = names[j];
          if (name === '__esModule' || isSymbolString(name))
            continue;
          (function(mod, name) {
            $defineProperty(object, name, {
              get: function() {
                return mod[name];
              },
              enumerable: true
            });
          })(arguments[i], names[j]);
        }
      }
      return object;
    }
    function isObject(x) {
      return x != null && (typeof x === 'object' || typeof x === 'function');
    }
    function toObject(x) {
      if (x == null)
        throw $TypeError();
      return $Object(x);
    }
    function checkObjectCoercible(argument) {
      if (argument == null) {
        throw new TypeError('Value cannot be converted to an Object');
      }
      return argument;
    }
    function polyfillSymbol(global, Symbol) {
      if (!global.Symbol) {
        global.Symbol = Symbol;
        Object.getOwnPropertySymbols = getOwnPropertySymbols;
      }
      if (!global.Symbol.iterator) {
        global.Symbol.iterator = Symbol('Symbol.iterator');
      }
      if (!global.Symbol.observer) {
        global.Symbol.observer = Symbol('Symbol.observer');
      }
    }
    function setupGlobals(global) {
      polyfillSymbol(global, Symbol);
      global.Reflect = global.Reflect || {};
      global.Reflect.global = global.Reflect.global || global;
      polyfillObject(global.Object);
    }
    setupGlobals(global);
    global.$traceurRuntime = {
      call: tailCall,
      checkObjectCoercible: checkObjectCoercible,
      construct: construct,
      continuation: createContinuation,
      createPrivateName: createPrivateName,
      defineProperties: $defineProperties,
      defineProperty: $defineProperty,
      exportStar: exportStar,
      getOwnHashObject: getOwnHashObject,
      getOwnPropertyDescriptor: $getOwnPropertyDescriptor,
      getOwnPropertyNames: $getOwnPropertyNames,
      initTailRecursiveFunction: initTailRecursiveFunction,
      isObject: isObject,
      isPrivateName: isPrivateName,
      isSymbolString: isSymbolString,
      keys: $keys,
      options: {},
      setupGlobals: setupGlobals,
      toObject: toObject,
      toProperty: toProperty,
      typeof: typeOf
    };
  })();
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this);
(function() {
  function buildFromEncodedParts(opt_scheme, opt_userInfo, opt_domain, opt_port, opt_path, opt_queryData, opt_fragment) {
    var out = [];
    if (opt_scheme) {
      out.push(opt_scheme, ':');
    }
    if (opt_domain) {
      out.push('//');
      if (opt_userInfo) {
        out.push(opt_userInfo, '@');
      }
      out.push(opt_domain);
      if (opt_port) {
        out.push(':', opt_port);
      }
    }
    if (opt_path) {
      out.push(opt_path);
    }
    if (opt_queryData) {
      out.push('?', opt_queryData);
    }
    if (opt_fragment) {
      out.push('#', opt_fragment);
    }
    return out.join('');
  }
  ;
  var splitRe = new RegExp('^' + '(?:' + '([^:/?#.]+)' + ':)?' + '(?://' + '(?:([^/?#]*)@)?' + '([\\w\\d\\-\\u0100-\\uffff.%]*)' + '(?::([0-9]+))?' + ')?' + '([^?#]+)?' + '(?:\\?([^#]*))?' + '(?:#(.*))?' + '$');
  var ComponentIndex = {
    SCHEME: 1,
    USER_INFO: 2,
    DOMAIN: 3,
    PORT: 4,
    PATH: 5,
    QUERY_DATA: 6,
    FRAGMENT: 7
  };
  function split(uri) {
    return (uri.match(splitRe));
  }
  function removeDotSegments(path) {
    if (path === '/')
      return '/';
    var leadingSlash = path[0] === '/' ? '/' : '';
    var trailingSlash = path.slice(-1) === '/' ? '/' : '';
    var segments = path.split('/');
    var out = [];
    var up = 0;
    for (var pos = 0; pos < segments.length; pos++) {
      var segment = segments[pos];
      switch (segment) {
        case '':
        case '.':
          break;
        case '..':
          if (out.length)
            out.pop();
          else
            up++;
          break;
        default:
          out.push(segment);
      }
    }
    if (!leadingSlash) {
      while (up-- > 0) {
        out.unshift('..');
      }
      if (out.length === 0)
        out.push('.');
    }
    return leadingSlash + out.join('/') + trailingSlash;
  }
  function joinAndCanonicalizePath(parts) {
    var path = parts[ComponentIndex.PATH] || '';
    path = removeDotSegments(path);
    parts[ComponentIndex.PATH] = path;
    return buildFromEncodedParts(parts[ComponentIndex.SCHEME], parts[ComponentIndex.USER_INFO], parts[ComponentIndex.DOMAIN], parts[ComponentIndex.PORT], parts[ComponentIndex.PATH], parts[ComponentIndex.QUERY_DATA], parts[ComponentIndex.FRAGMENT]);
  }
  function canonicalizeUrl(url) {
    var parts = split(url);
    return joinAndCanonicalizePath(parts);
  }
  function resolveUrl(base, url) {
    var parts = split(url);
    var baseParts = split(base);
    if (parts[ComponentIndex.SCHEME]) {
      return joinAndCanonicalizePath(parts);
    } else {
      parts[ComponentIndex.SCHEME] = baseParts[ComponentIndex.SCHEME];
    }
    for (var i = ComponentIndex.SCHEME; i <= ComponentIndex.PORT; i++) {
      if (!parts[i]) {
        parts[i] = baseParts[i];
      }
    }
    if (parts[ComponentIndex.PATH][0] == '/') {
      return joinAndCanonicalizePath(parts);
    }
    var path = baseParts[ComponentIndex.PATH];
    var index = path.lastIndexOf('/');
    path = path.slice(0, index + 1) + parts[ComponentIndex.PATH];
    parts[ComponentIndex.PATH] = path;
    return joinAndCanonicalizePath(parts);
  }
  function isAbsolute(name) {
    if (!name)
      return false;
    if (name[0] === '/')
      return true;
    var parts = split(name);
    if (parts[ComponentIndex.SCHEME])
      return true;
    return false;
  }
  $traceurRuntime.canonicalizeUrl = canonicalizeUrl;
  $traceurRuntime.isAbsolute = isAbsolute;
  $traceurRuntime.removeDotSegments = removeDotSegments;
  $traceurRuntime.resolveUrl = resolveUrl;
})();
(function(global) {
  'use strict';
  var $__1 = $traceurRuntime,
      canonicalizeUrl = $__1.canonicalizeUrl,
      resolveUrl = $__1.resolveUrl,
      isAbsolute = $__1.isAbsolute;
  var moduleInstantiators = Object.create(null);
  var baseURL;
  if (global.location && global.location.href)
    baseURL = resolveUrl(global.location.href, './');
  else
    baseURL = '';
  function UncoatedModuleEntry(url, uncoatedModule) {
    this.url = url;
    this.value_ = uncoatedModule;
  }
  function ModuleEvaluationError(erroneousModuleName, cause) {
    this.message = this.constructor.name + ': ' + this.stripCause(cause) + ' in ' + erroneousModuleName;
    if (!(cause instanceof ModuleEvaluationError) && cause.stack)
      this.stack = this.stripStack(cause.stack);
    else
      this.stack = '';
  }
  ModuleEvaluationError.prototype = Object.create(Error.prototype);
  ModuleEvaluationError.prototype.constructor = ModuleEvaluationError;
  ModuleEvaluationError.prototype.stripError = function(message) {
    return message.replace(/.*Error:/, this.constructor.name + ':');
  };
  ModuleEvaluationError.prototype.stripCause = function(cause) {
    if (!cause)
      return '';
    if (!cause.message)
      return cause + '';
    return this.stripError(cause.message);
  };
  ModuleEvaluationError.prototype.loadedBy = function(moduleName) {
    this.stack += '\n loaded by ' + moduleName;
  };
  ModuleEvaluationError.prototype.stripStack = function(causeStack) {
    var stack = [];
    causeStack.split('\n').some((function(frame) {
      if (/UncoatedModuleInstantiator/.test(frame))
        return true;
      stack.push(frame);
    }));
    stack[0] = this.stripError(stack[0]);
    return stack.join('\n');
  };
  function beforeLines(lines, number) {
    var result = [];
    var first = number - 3;
    if (first < 0)
      first = 0;
    for (var i = first; i < number; i++) {
      result.push(lines[i]);
    }
    return result;
  }
  function afterLines(lines, number) {
    var last = number + 1;
    if (last > lines.length - 1)
      last = lines.length - 1;
    var result = [];
    for (var i = number; i <= last; i++) {
      result.push(lines[i]);
    }
    return result;
  }
  function columnSpacing(columns) {
    var result = '';
    for (var i = 0; i < columns - 1; i++) {
      result += '-';
    }
    return result;
  }
  function UncoatedModuleInstantiator(url, func) {
    UncoatedModuleEntry.call(this, url, null);
    this.func = func;
  }
  UncoatedModuleInstantiator.prototype = Object.create(UncoatedModuleEntry.prototype);
  UncoatedModuleInstantiator.prototype.getUncoatedModule = function() {
    var $__0 = this;
    if (this.value_)
      return this.value_;
    try {
      var relativeRequire;
      if (typeof $traceurRuntime !== undefined && $traceurRuntime.require) {
        relativeRequire = $traceurRuntime.require.bind(null, this.url);
      }
      return this.value_ = this.func.call(global, relativeRequire);
    } catch (ex) {
      if (ex instanceof ModuleEvaluationError) {
        ex.loadedBy(this.url);
        throw ex;
      }
      if (ex.stack) {
        var lines = this.func.toString().split('\n');
        var evaled = [];
        ex.stack.split('\n').some((function(frame, index) {
          if (frame.indexOf('UncoatedModuleInstantiator.getUncoatedModule') > 0)
            return true;
          var m = /(at\s[^\s]*\s).*>:(\d*):(\d*)\)/.exec(frame);
          if (m) {
            var line = parseInt(m[2], 10);
            evaled = evaled.concat(beforeLines(lines, line));
            if (index === 1) {
              evaled.push(columnSpacing(m[3]) + '^ ' + $__0.url);
            } else {
              evaled.push(columnSpacing(m[3]) + '^');
            }
            evaled = evaled.concat(afterLines(lines, line));
            evaled.push('= = = = = = = = =');
          } else {
            evaled.push(frame);
          }
        }));
        ex.stack = evaled.join('\n');
      }
      throw new ModuleEvaluationError(this.url, ex);
    }
  };
  function getUncoatedModuleInstantiator(name) {
    if (!name)
      return ;
    var url = ModuleStore.normalize(name);
    return moduleInstantiators[url];
  }
  ;
  var moduleInstances = Object.create(null);
  var liveModuleSentinel = {};
  function Module(uncoatedModule) {
    var isLive = arguments[1];
    var coatedModule = Object.create(null);
    Object.getOwnPropertyNames(uncoatedModule).forEach((function(name) {
      var getter,
          value;
      if (isLive === liveModuleSentinel) {
        var descr = Object.getOwnPropertyDescriptor(uncoatedModule, name);
        if (descr.get)
          getter = descr.get;
      }
      if (!getter) {
        value = uncoatedModule[name];
        getter = function() {
          return value;
        };
      }
      Object.defineProperty(coatedModule, name, {
        get: getter,
        enumerable: true
      });
    }));
    Object.preventExtensions(coatedModule);
    return coatedModule;
  }
  var ModuleStore = {
    normalize: function(name, refererName, refererAddress) {
      if (typeof name !== 'string')
        throw new TypeError('module name must be a string, not ' + typeof name);
      if (isAbsolute(name))
        return canonicalizeUrl(name);
      if (/[^\.]\/\.\.\//.test(name)) {
        throw new Error('module name embeds /../: ' + name);
      }
      if (name[0] === '.' && refererName)
        return resolveUrl(refererName, name);
      return canonicalizeUrl(name);
    },
    get: function(normalizedName) {
      var m = getUncoatedModuleInstantiator(normalizedName);
      if (!m)
        return undefined;
      var moduleInstance = moduleInstances[m.url];
      if (moduleInstance)
        return moduleInstance;
      moduleInstance = Module(m.getUncoatedModule(), liveModuleSentinel);
      return moduleInstances[m.url] = moduleInstance;
    },
    set: function(normalizedName, module) {
      normalizedName = String(normalizedName);
      moduleInstantiators[normalizedName] = new UncoatedModuleInstantiator(normalizedName, (function() {
        return module;
      }));
      moduleInstances[normalizedName] = module;
    },
    get baseURL() {
      return baseURL;
    },
    set baseURL(v) {
      baseURL = String(v);
    },
    registerModule: function(name, deps, func) {
      var normalizedName = ModuleStore.normalize(name);
      if (moduleInstantiators[normalizedName])
        throw new Error('duplicate module named ' + normalizedName);
      moduleInstantiators[normalizedName] = new UncoatedModuleInstantiator(normalizedName, func);
    },
    bundleStore: Object.create(null),
    register: function(name, deps, func) {
      if (!deps || !deps.length && !func.length) {
        this.registerModule(name, deps, func);
      } else {
        this.bundleStore[name] = {
          deps: deps,
          execute: function() {
            var $__0 = arguments;
            var depMap = {};
            deps.forEach((function(dep, index) {
              return depMap[dep] = $__0[index];
            }));
            var registryEntry = func.call(this, depMap);
            registryEntry.execute.call(this);
            return registryEntry.exports;
          }
        };
      }
    },
    getAnonymousModule: function(func) {
      return new Module(func.call(global), liveModuleSentinel);
    },
    getForTesting: function(name) {
      var $__0 = this;
      if (!this.testingPrefix_) {
        Object.keys(moduleInstances).some((function(key) {
          var m = /(traceur@[^\/]*\/)/.exec(key);
          if (m) {
            $__0.testingPrefix_ = m[1];
            return true;
          }
        }));
      }
      return this.get(this.testingPrefix_ + name);
    }
  };
  var moduleStoreModule = new Module({ModuleStore: ModuleStore});
  ModuleStore.set('@traceur/src/runtime/ModuleStore.js', moduleStoreModule);
  var setupGlobals = $traceurRuntime.setupGlobals;
  $traceurRuntime.setupGlobals = function(global) {
    setupGlobals(global);
  };
  $traceurRuntime.ModuleStore = ModuleStore;
  global.System = {
    register: ModuleStore.register.bind(ModuleStore),
    registerModule: ModuleStore.registerModule.bind(ModuleStore),
    get: ModuleStore.get,
    set: ModuleStore.set,
    normalize: ModuleStore.normalize
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this);
System.registerModule("traceur-runtime@0.0.88/src/runtime/async.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/async.js";
  if (typeof $traceurRuntime !== 'object') {
    throw new Error('traceur runtime not found.');
  }
  var $createPrivateName = $traceurRuntime.createPrivateName;
  var $defineProperty = $traceurRuntime.defineProperty;
  var $defineProperties = $traceurRuntime.defineProperties;
  var $create = Object.create;
  var thisName = $createPrivateName();
  var argsName = $createPrivateName();
  var observeName = $createPrivateName();
  function AsyncGeneratorFunction() {}
  function AsyncGeneratorFunctionPrototype() {}
  AsyncGeneratorFunction.prototype = AsyncGeneratorFunctionPrototype;
  AsyncGeneratorFunctionPrototype.constructor = AsyncGeneratorFunction;
  $defineProperty(AsyncGeneratorFunctionPrototype, 'constructor', {enumerable: false});
  var AsyncGeneratorContext = (function() {
    function AsyncGeneratorContext(observer) {
      var $__0 = this;
      this.decoratedObserver = $traceurRuntime.createDecoratedGenerator(observer, (function() {
        $__0.done = true;
      }));
      this.done = false;
      this.inReturn = false;
    }
    return ($traceurRuntime.createClass)(AsyncGeneratorContext, {
      throw: function(error) {
        if (!this.inReturn) {
          throw error;
        }
      },
      yield: function(value) {
        if (this.done) {
          this.inReturn = true;
          throw undefined;
        }
        var result;
        try {
          result = this.decoratedObserver.next(value);
        } catch (e) {
          this.done = true;
          throw e;
        }
        if (result === undefined) {
          return ;
        }
        if (result.done) {
          this.done = true;
          this.inReturn = true;
          throw undefined;
        }
        return result.value;
      },
      yieldFor: function(observable) {
        var ctx = this;
        return $traceurRuntime.observeForEach(observable[$traceurRuntime.toProperty(Symbol.observer)].bind(observable), function(value) {
          if (ctx.done) {
            this.return();
            return ;
          }
          var result;
          try {
            result = ctx.decoratedObserver.next(value);
          } catch (e) {
            ctx.done = true;
            throw e;
          }
          if (result === undefined) {
            return ;
          }
          if (result.done) {
            ctx.done = true;
          }
          return result;
        });
      }
    }, {});
  }());
  AsyncGeneratorFunctionPrototype.prototype[Symbol.observer] = function(observer) {
    var observe = this[observeName];
    var ctx = new AsyncGeneratorContext(observer);
    $traceurRuntime.schedule((function() {
      return observe(ctx);
    })).then((function(value) {
      if (!ctx.done) {
        ctx.decoratedObserver.return(value);
      }
    })).catch((function(error) {
      if (!ctx.done) {
        ctx.decoratedObserver.throw(error);
      }
    }));
    return ctx.decoratedObserver;
  };
  $defineProperty(AsyncGeneratorFunctionPrototype.prototype, Symbol.observer, {enumerable: false});
  function initAsyncGeneratorFunction(functionObject) {
    functionObject.prototype = $create(AsyncGeneratorFunctionPrototype.prototype);
    functionObject.__proto__ = AsyncGeneratorFunctionPrototype;
    return functionObject;
  }
  function createAsyncGeneratorInstance(observe, functionObject) {
    for (var args = [],
        $__2 = 2; $__2 < arguments.length; $__2++)
      args[$__2 - 2] = arguments[$__2];
    var object = $create(functionObject.prototype);
    object[thisName] = this;
    object[argsName] = args;
    object[observeName] = observe;
    return object;
  }
  function observeForEach(observe, next) {
    return new Promise((function(resolve, reject) {
      var generator = observe({
        next: function(value) {
          return next.call(generator, value);
        },
        throw: function(error) {
          reject(error);
        },
        return: function(value) {
          resolve(value);
        }
      });
    }));
  }
  function schedule(asyncF) {
    return Promise.resolve().then(asyncF);
  }
  var generator = Symbol();
  var onDone = Symbol();
  var DecoratedGenerator = (function() {
    function DecoratedGenerator(_generator, _onDone) {
      this[generator] = _generator;
      this[onDone] = _onDone;
    }
    return ($traceurRuntime.createClass)(DecoratedGenerator, {
      next: function(value) {
        var result = this[generator].next(value);
        if (result !== undefined && result.done) {
          this[onDone].call(this);
        }
        return result;
      },
      throw: function(error) {
        this[onDone].call(this);
        return this[generator].throw(error);
      },
      return: function(value) {
        this[onDone].call(this);
        return this[generator].return(value);
      }
    }, {});
  }());
  function createDecoratedGenerator(generator, onDone) {
    return new DecoratedGenerator(generator, onDone);
  }
  $traceurRuntime.initAsyncGeneratorFunction = initAsyncGeneratorFunction;
  $traceurRuntime.createAsyncGeneratorInstance = createAsyncGeneratorInstance;
  $traceurRuntime.observeForEach = observeForEach;
  $traceurRuntime.schedule = schedule;
  $traceurRuntime.createDecoratedGenerator = createDecoratedGenerator;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/classes.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/classes.js";
  var $Object = Object;
  var $TypeError = TypeError;
  var $create = $Object.create;
  var $defineProperties = $traceurRuntime.defineProperties;
  var $defineProperty = $traceurRuntime.defineProperty;
  var $getOwnPropertyDescriptor = $traceurRuntime.getOwnPropertyDescriptor;
  var $getOwnPropertyNames = $traceurRuntime.getOwnPropertyNames;
  var $getPrototypeOf = Object.getPrototypeOf;
  var $__0 = Object,
      getOwnPropertyNames = $__0.getOwnPropertyNames,
      getOwnPropertySymbols = $__0.getOwnPropertySymbols;
  function superDescriptor(homeObject, name) {
    var proto = $getPrototypeOf(homeObject);
    do {
      var result = $getOwnPropertyDescriptor(proto, name);
      if (result)
        return result;
      proto = $getPrototypeOf(proto);
    } while (proto);
    return undefined;
  }
  function superConstructor(ctor) {
    return ctor.__proto__;
  }
  function superGet(self, homeObject, name) {
    var descriptor = superDescriptor(homeObject, name);
    if (descriptor) {
      if (!descriptor.get)
        return descriptor.value;
      return descriptor.get.call(self);
    }
    return undefined;
  }
  function superSet(self, homeObject, name, value) {
    var descriptor = superDescriptor(homeObject, name);
    if (descriptor && descriptor.set) {
      descriptor.set.call(self, value);
      return value;
    }
    throw $TypeError(("super has no setter '" + name + "'."));
  }
  function forEachPropertyKey(object, f) {
    getOwnPropertyNames(object).forEach(f);
    getOwnPropertySymbols(object).forEach(f);
  }
  function getDescriptors(object) {
    var descriptors = {};
    forEachPropertyKey(object, (function(key) {
      descriptors[key] = $getOwnPropertyDescriptor(object, key);
      descriptors[key].enumerable = false;
    }));
    return descriptors;
  }
  var nonEnum = {enumerable: false};
  function makePropertiesNonEnumerable(object) {
    forEachPropertyKey(object, (function(key) {
      $defineProperty(object, key, nonEnum);
    }));
  }
  function createClass(ctor, object, staticObject, superClass) {
    $defineProperty(object, 'constructor', {
      value: ctor,
      configurable: true,
      enumerable: false,
      writable: true
    });
    if (arguments.length > 3) {
      if (typeof superClass === 'function')
        ctor.__proto__ = superClass;
      ctor.prototype = $create(getProtoParent(superClass), getDescriptors(object));
    } else {
      makePropertiesNonEnumerable(object);
      ctor.prototype = object;
    }
    $defineProperty(ctor, 'prototype', {
      configurable: false,
      writable: false
    });
    return $defineProperties(ctor, getDescriptors(staticObject));
  }
  function getProtoParent(superClass) {
    if (typeof superClass === 'function') {
      var prototype = superClass.prototype;
      if ($Object(prototype) === prototype || prototype === null)
        return superClass.prototype;
      throw new $TypeError('super prototype must be an Object or null');
    }
    if (superClass === null)
      return null;
    throw new $TypeError(("Super expression must either be null or a function, not " + typeof superClass + "."));
  }
  $traceurRuntime.createClass = createClass;
  $traceurRuntime.superConstructor = superConstructor;
  $traceurRuntime.superGet = superGet;
  $traceurRuntime.superSet = superSet;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/destructuring.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/destructuring.js";
  function iteratorToArray(iter) {
    var rv = [];
    var i = 0;
    var tmp;
    while (!(tmp = iter.next()).done) {
      rv[i++] = tmp.value;
    }
    return rv;
  }
  $traceurRuntime.iteratorToArray = iteratorToArray;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/generators.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/generators.js";
  if (typeof $traceurRuntime !== 'object') {
    throw new Error('traceur runtime not found.');
  }
  var createPrivateName = $traceurRuntime.createPrivateName;
  var $defineProperties = $traceurRuntime.defineProperties;
  var $defineProperty = $traceurRuntime.defineProperty;
  var $create = Object.create;
  var $TypeError = TypeError;
  function nonEnum(value) {
    return {
      configurable: true,
      enumerable: false,
      value: value,
      writable: true
    };
  }
  var ST_NEWBORN = 0;
  var ST_EXECUTING = 1;
  var ST_SUSPENDED = 2;
  var ST_CLOSED = 3;
  var END_STATE = -2;
  var RETHROW_STATE = -3;
  function getInternalError(state) {
    return new Error('Traceur compiler bug: invalid state in state machine: ' + state);
  }
  var RETURN_SENTINEL = {};
  function GeneratorContext() {
    this.state = 0;
    this.GState = ST_NEWBORN;
    this.storedException = undefined;
    this.finallyFallThrough = undefined;
    this.sent_ = undefined;
    this.returnValue = undefined;
    this.oldReturnValue = undefined;
    this.tryStack_ = [];
  }
  GeneratorContext.prototype = {
    pushTry: function(catchState, finallyState) {
      if (finallyState !== null) {
        var finallyFallThrough = null;
        for (var i = this.tryStack_.length - 1; i >= 0; i--) {
          if (this.tryStack_[i].catch !== undefined) {
            finallyFallThrough = this.tryStack_[i].catch;
            break;
          }
        }
        if (finallyFallThrough === null)
          finallyFallThrough = RETHROW_STATE;
        this.tryStack_.push({
          finally: finallyState,
          finallyFallThrough: finallyFallThrough
        });
      }
      if (catchState !== null) {
        this.tryStack_.push({catch: catchState});
      }
    },
    popTry: function() {
      this.tryStack_.pop();
    },
    maybeUncatchable: function() {
      if (this.storedException === RETURN_SENTINEL) {
        throw RETURN_SENTINEL;
      }
    },
    get sent() {
      this.maybeThrow();
      return this.sent_;
    },
    set sent(v) {
      this.sent_ = v;
    },
    get sentIgnoreThrow() {
      return this.sent_;
    },
    maybeThrow: function() {
      if (this.action === 'throw') {
        this.action = 'next';
        throw this.sent_;
      }
    },
    end: function() {
      switch (this.state) {
        case END_STATE:
          return this;
        case RETHROW_STATE:
          throw this.storedException;
        default:
          throw getInternalError(this.state);
      }
    },
    handleException: function(ex) {
      this.GState = ST_CLOSED;
      this.state = END_STATE;
      throw ex;
    },
    wrapYieldStar: function(iterator) {
      var ctx = this;
      return {
        next: function(v) {
          return iterator.next(v);
        },
        throw: function(e) {
          var result;
          if (e === RETURN_SENTINEL) {
            if (iterator.return) {
              result = iterator.return(ctx.returnValue);
              if (!result.done) {
                ctx.returnValue = ctx.oldReturnValue;
                return result;
              }
              ctx.returnValue = result.value;
            }
            throw e;
          }
          if (iterator.throw) {
            return iterator.throw(e);
          }
          iterator.return && iterator.return();
          throw $TypeError('Inner iterator does not have a throw method');
        }
      };
    }
  };
  function nextOrThrow(ctx, moveNext, action, x) {
    switch (ctx.GState) {
      case ST_EXECUTING:
        throw new Error(("\"" + action + "\" on executing generator"));
      case ST_CLOSED:
        if (action == 'next') {
          return {
            value: undefined,
            done: true
          };
        }
        if (x === RETURN_SENTINEL) {
          return {
            value: ctx.returnValue,
            done: true
          };
        }
        throw x;
      case ST_NEWBORN:
        if (action === 'throw') {
          ctx.GState = ST_CLOSED;
          if (x === RETURN_SENTINEL) {
            return {
              value: ctx.returnValue,
              done: true
            };
          }
          throw x;
        }
        if (x !== undefined)
          throw $TypeError('Sent value to newborn generator');
      case ST_SUSPENDED:
        ctx.GState = ST_EXECUTING;
        ctx.action = action;
        ctx.sent = x;
        var value;
        try {
          value = moveNext(ctx);
        } catch (ex) {
          if (ex === RETURN_SENTINEL) {
            value = ctx;
          } else {
            throw ex;
          }
        }
        var done = value === ctx;
        if (done)
          value = ctx.returnValue;
        ctx.GState = done ? ST_CLOSED : ST_SUSPENDED;
        return {
          value: value,
          done: done
        };
    }
  }
  var ctxName = createPrivateName();
  var moveNextName = createPrivateName();
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}
  GeneratorFunction.prototype = GeneratorFunctionPrototype;
  $defineProperty(GeneratorFunctionPrototype, 'constructor', nonEnum(GeneratorFunction));
  GeneratorFunctionPrototype.prototype = {
    constructor: GeneratorFunctionPrototype,
    next: function(v) {
      return nextOrThrow(this[ctxName], this[moveNextName], 'next', v);
    },
    throw: function(v) {
      return nextOrThrow(this[ctxName], this[moveNextName], 'throw', v);
    },
    return: function(v) {
      this[ctxName].oldReturnValue = this[ctxName].returnValue;
      this[ctxName].returnValue = v;
      return nextOrThrow(this[ctxName], this[moveNextName], 'throw', RETURN_SENTINEL);
    }
  };
  $defineProperties(GeneratorFunctionPrototype.prototype, {
    constructor: {enumerable: false},
    next: {enumerable: false},
    throw: {enumerable: false},
    return: {enumerable: false}
  });
  Object.defineProperty(GeneratorFunctionPrototype.prototype, Symbol.iterator, nonEnum(function() {
    return this;
  }));
  function createGeneratorInstance(innerFunction, functionObject, self) {
    var moveNext = getMoveNext(innerFunction, self);
    var ctx = new GeneratorContext();
    var object = $create(functionObject.prototype);
    object[ctxName] = ctx;
    object[moveNextName] = moveNext;
    return object;
  }
  function initGeneratorFunction(functionObject) {
    functionObject.prototype = $create(GeneratorFunctionPrototype.prototype);
    functionObject.__proto__ = GeneratorFunctionPrototype;
    return functionObject;
  }
  function AsyncFunctionContext() {
    GeneratorContext.call(this);
    this.err = undefined;
    var ctx = this;
    ctx.result = new Promise(function(resolve, reject) {
      ctx.resolve = resolve;
      ctx.reject = reject;
    });
  }
  AsyncFunctionContext.prototype = $create(GeneratorContext.prototype);
  AsyncFunctionContext.prototype.end = function() {
    switch (this.state) {
      case END_STATE:
        this.resolve(this.returnValue);
        break;
      case RETHROW_STATE:
        this.reject(this.storedException);
        break;
      default:
        this.reject(getInternalError(this.state));
    }
  };
  AsyncFunctionContext.prototype.handleException = function() {
    this.state = RETHROW_STATE;
  };
  function asyncWrap(innerFunction, self) {
    var moveNext = getMoveNext(innerFunction, self);
    var ctx = new AsyncFunctionContext();
    ctx.createCallback = function(newState) {
      return function(value) {
        ctx.state = newState;
        ctx.value = value;
        moveNext(ctx);
      };
    };
    ctx.errback = function(err) {
      handleCatch(ctx, err);
      moveNext(ctx);
    };
    moveNext(ctx);
    return ctx.result;
  }
  function getMoveNext(innerFunction, self) {
    return function(ctx) {
      while (true) {
        try {
          return innerFunction.call(self, ctx);
        } catch (ex) {
          handleCatch(ctx, ex);
        }
      }
    };
  }
  function handleCatch(ctx, ex) {
    ctx.storedException = ex;
    var last = ctx.tryStack_[ctx.tryStack_.length - 1];
    if (!last) {
      ctx.handleException(ex);
      return ;
    }
    ctx.state = last.catch !== undefined ? last.catch : last.finally;
    if (last.finallyFallThrough !== undefined)
      ctx.finallyFallThrough = last.finallyFallThrough;
  }
  $traceurRuntime.asyncWrap = asyncWrap;
  $traceurRuntime.initGeneratorFunction = initGeneratorFunction;
  $traceurRuntime.createGeneratorInstance = createGeneratorInstance;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/relativeRequire.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/relativeRequire.js";
  var path;
  function relativeRequire(callerPath, requiredPath) {
    path = path || typeof require !== 'undefined' && require('path');
    function isDirectory(path) {
      return path.slice(-1) === '/';
    }
    function isAbsolute(path) {
      return path[0] === '/';
    }
    function isRelative(path) {
      return path[0] === '.';
    }
    if (isDirectory(requiredPath) || isAbsolute(requiredPath))
      return ;
    return isRelative(requiredPath) ? require(path.resolve(path.dirname(callerPath), requiredPath)) : require(requiredPath);
  }
  $traceurRuntime.require = relativeRequire;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/spread.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/spread.js";
  function spread() {
    var rv = [],
        j = 0,
        iterResult;
    for (var i = 0; i < arguments.length; i++) {
      var valueToSpread = $traceurRuntime.checkObjectCoercible(arguments[i]);
      if (typeof valueToSpread[$traceurRuntime.toProperty(Symbol.iterator)] !== 'function') {
        throw new TypeError('Cannot spread non-iterable object.');
      }
      var iter = valueToSpread[$traceurRuntime.toProperty(Symbol.iterator)]();
      while (!(iterResult = iter.next()).done) {
        rv[j++] = iterResult.value;
      }
    }
    return rv;
  }
  $traceurRuntime.spread = spread;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/template.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/template.js";
  var $__0 = Object,
      defineProperty = $__0.defineProperty,
      freeze = $__0.freeze;
  var slice = Array.prototype.slice;
  var map = Object.create(null);
  function getTemplateObject(raw) {
    var cooked = arguments[1];
    var key = raw.join('${}');
    var templateObject = map[key];
    if (templateObject)
      return templateObject;
    if (!cooked) {
      cooked = slice.call(raw);
    }
    return map[key] = freeze(defineProperty(cooked, 'raw', {value: freeze(raw)}));
  }
  $traceurRuntime.getTemplateObject = getTemplateObject;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/type-assertions.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/type-assertions.js";
  var types = {
    any: {name: 'any'},
    boolean: {name: 'boolean'},
    number: {name: 'number'},
    string: {name: 'string'},
    symbol: {name: 'symbol'},
    void: {name: 'void'}
  };
  var GenericType = (function() {
    function GenericType(type, argumentTypes) {
      this.type = type;
      this.argumentTypes = argumentTypes;
    }
    return ($traceurRuntime.createClass)(GenericType, {}, {});
  }());
  var typeRegister = Object.create(null);
  function genericType(type) {
    for (var argumentTypes = [],
        $__1 = 1; $__1 < arguments.length; $__1++)
      argumentTypes[$__1 - 1] = arguments[$__1];
    var typeMap = typeRegister;
    var key = $traceurRuntime.getOwnHashObject(type).hash;
    if (!typeMap[key]) {
      typeMap[key] = Object.create(null);
    }
    typeMap = typeMap[key];
    for (var i = 0; i < argumentTypes.length - 1; i++) {
      key = $traceurRuntime.getOwnHashObject(argumentTypes[i]).hash;
      if (!typeMap[key]) {
        typeMap[key] = Object.create(null);
      }
      typeMap = typeMap[key];
    }
    var tail = argumentTypes[argumentTypes.length - 1];
    key = $traceurRuntime.getOwnHashObject(tail).hash;
    if (!typeMap[key]) {
      typeMap[key] = new GenericType(type, argumentTypes);
    }
    return typeMap[key];
  }
  $traceurRuntime.GenericType = GenericType;
  $traceurRuntime.genericType = genericType;
  $traceurRuntime.type = types;
  return {};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/runtime-modules.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/runtime-modules.js";
  System.get("traceur-runtime@0.0.88/src/runtime/relativeRequire.js");
  System.get("traceur-runtime@0.0.88/src/runtime/spread.js");
  System.get("traceur-runtime@0.0.88/src/runtime/destructuring.js");
  System.get("traceur-runtime@0.0.88/src/runtime/classes.js");
  System.get("traceur-runtime@0.0.88/src/runtime/async.js");
  System.get("traceur-runtime@0.0.88/src/runtime/generators.js");
  System.get("traceur-runtime@0.0.88/src/runtime/template.js");
  System.get("traceur-runtime@0.0.88/src/runtime/type-assertions.js");
  return {};
});
System.get("traceur-runtime@0.0.88/src/runtime/runtime-modules.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/utils.js";
  var $ceil = Math.ceil;
  var $floor = Math.floor;
  var $isFinite = isFinite;
  var $isNaN = isNaN;
  var $pow = Math.pow;
  var $min = Math.min;
  var toObject = $traceurRuntime.toObject;
  function toUint32(x) {
    return x >>> 0;
  }
  function isObject(x) {
    return x && (typeof x === 'object' || typeof x === 'function');
  }
  function isCallable(x) {
    return typeof x === 'function';
  }
  function isNumber(x) {
    return typeof x === 'number';
  }
  function toInteger(x) {
    x = +x;
    if ($isNaN(x))
      return 0;
    if (x === 0 || !$isFinite(x))
      return x;
    return x > 0 ? $floor(x) : $ceil(x);
  }
  var MAX_SAFE_LENGTH = $pow(2, 53) - 1;
  function toLength(x) {
    var len = toInteger(x);
    return len < 0 ? 0 : $min(len, MAX_SAFE_LENGTH);
  }
  function checkIterable(x) {
    return !isObject(x) ? undefined : x[Symbol.iterator];
  }
  function isConstructor(x) {
    return isCallable(x);
  }
  function createIteratorResultObject(value, done) {
    return {
      value: value,
      done: done
    };
  }
  function maybeDefine(object, name, descr) {
    if (!(name in object)) {
      Object.defineProperty(object, name, descr);
    }
  }
  function maybeDefineMethod(object, name, value) {
    maybeDefine(object, name, {
      value: value,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
  function maybeDefineConst(object, name, value) {
    maybeDefine(object, name, {
      value: value,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }
  function maybeAddFunctions(object, functions) {
    for (var i = 0; i < functions.length; i += 2) {
      var name = functions[i];
      var value = functions[i + 1];
      maybeDefineMethod(object, name, value);
    }
  }
  function maybeAddConsts(object, consts) {
    for (var i = 0; i < consts.length; i += 2) {
      var name = consts[i];
      var value = consts[i + 1];
      maybeDefineConst(object, name, value);
    }
  }
  function maybeAddIterator(object, func, Symbol) {
    if (!Symbol || !Symbol.iterator || object[Symbol.iterator])
      return ;
    if (object['@@iterator'])
      func = object['@@iterator'];
    Object.defineProperty(object, Symbol.iterator, {
      value: func,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
  var polyfills = [];
  function registerPolyfill(func) {
    polyfills.push(func);
  }
  function polyfillAll(global) {
    polyfills.forEach((function(f) {
      return f(global);
    }));
  }
  return {
    get toObject() {
      return toObject;
    },
    get toUint32() {
      return toUint32;
    },
    get isObject() {
      return isObject;
    },
    get isCallable() {
      return isCallable;
    },
    get isNumber() {
      return isNumber;
    },
    get toInteger() {
      return toInteger;
    },
    get toLength() {
      return toLength;
    },
    get checkIterable() {
      return checkIterable;
    },
    get isConstructor() {
      return isConstructor;
    },
    get createIteratorResultObject() {
      return createIteratorResultObject;
    },
    get maybeDefine() {
      return maybeDefine;
    },
    get maybeDefineMethod() {
      return maybeDefineMethod;
    },
    get maybeDefineConst() {
      return maybeDefineConst;
    },
    get maybeAddFunctions() {
      return maybeAddFunctions;
    },
    get maybeAddConsts() {
      return maybeAddConsts;
    },
    get maybeAddIterator() {
      return maybeAddIterator;
    },
    get registerPolyfill() {
      return registerPolyfill;
    },
    get polyfillAll() {
      return polyfillAll;
    }
  };
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Map.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Map.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      isObject = $__0.isObject,
      maybeAddIterator = $__0.maybeAddIterator,
      registerPolyfill = $__0.registerPolyfill;
  var getOwnHashObject = $traceurRuntime.getOwnHashObject;
  var $hasOwnProperty = Object.prototype.hasOwnProperty;
  var deletedSentinel = {};
  function lookupIndex(map, key) {
    if (isObject(key)) {
      var hashObject = getOwnHashObject(key);
      return hashObject && map.objectIndex_[hashObject.hash];
    }
    if (typeof key === 'string')
      return map.stringIndex_[key];
    return map.primitiveIndex_[key];
  }
  function initMap(map) {
    map.entries_ = [];
    map.objectIndex_ = Object.create(null);
    map.stringIndex_ = Object.create(null);
    map.primitiveIndex_ = Object.create(null);
    map.deletedCount_ = 0;
  }
  var Map = (function() {
    function Map() {
      var $__10,
          $__11;
      var iterable = arguments[0];
      if (!isObject(this))
        throw new TypeError('Map called on incompatible type');
      if ($hasOwnProperty.call(this, 'entries_')) {
        throw new TypeError('Map can not be reentrantly initialised');
      }
      initMap(this);
      if (iterable !== null && iterable !== undefined) {
        var $__5 = true;
        var $__6 = false;
        var $__7 = undefined;
        try {
          for (var $__3 = void 0,
              $__2 = (iterable)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
            var $__9 = $__3.value,
                key = ($__10 = $__9[$traceurRuntime.toProperty(Symbol.iterator)](), ($__11 = $__10.next()).done ? void 0 : $__11.value),
                value = ($__11 = $__10.next()).done ? void 0 : $__11.value;
            {
              this.set(key, value);
            }
          }
        } catch ($__8) {
          $__6 = true;
          $__7 = $__8;
        } finally {
          try {
            if (!$__5 && $__2.return != null) {
              $__2.return();
            }
          } finally {
            if ($__6) {
              throw $__7;
            }
          }
        }
      }
    }
    return ($traceurRuntime.createClass)(Map, {
      get size() {
        return this.entries_.length / 2 - this.deletedCount_;
      },
      get: function(key) {
        var index = lookupIndex(this, key);
        if (index !== undefined)
          return this.entries_[index + 1];
      },
      set: function(key, value) {
        var objectMode = isObject(key);
        var stringMode = typeof key === 'string';
        var index = lookupIndex(this, key);
        if (index !== undefined) {
          this.entries_[index + 1] = value;
        } else {
          index = this.entries_.length;
          this.entries_[index] = key;
          this.entries_[index + 1] = value;
          if (objectMode) {
            var hashObject = getOwnHashObject(key);
            var hash = hashObject.hash;
            this.objectIndex_[hash] = index;
          } else if (stringMode) {
            this.stringIndex_[key] = index;
          } else {
            this.primitiveIndex_[key] = index;
          }
        }
        return this;
      },
      has: function(key) {
        return lookupIndex(this, key) !== undefined;
      },
      delete: function(key) {
        var objectMode = isObject(key);
        var stringMode = typeof key === 'string';
        var index;
        var hash;
        if (objectMode) {
          var hashObject = getOwnHashObject(key);
          if (hashObject) {
            index = this.objectIndex_[hash = hashObject.hash];
            delete this.objectIndex_[hash];
          }
        } else if (stringMode) {
          index = this.stringIndex_[key];
          delete this.stringIndex_[key];
        } else {
          index = this.primitiveIndex_[key];
          delete this.primitiveIndex_[key];
        }
        if (index !== undefined) {
          this.entries_[index] = deletedSentinel;
          this.entries_[index + 1] = undefined;
          this.deletedCount_++;
          return true;
        }
        return false;
      },
      clear: function() {
        initMap(this);
      },
      forEach: function(callbackFn) {
        var thisArg = arguments[1];
        for (var i = 0; i < this.entries_.length; i += 2) {
          var key = this.entries_[i];
          var value = this.entries_[i + 1];
          if (key === deletedSentinel)
            continue;
          callbackFn.call(thisArg, value, key, this);
        }
      },
      entries: $traceurRuntime.initGeneratorFunction(function $__12() {
        var i,
            key,
            value;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
          while (true)
            switch ($ctx.state) {
              case 0:
                i = 0;
                $ctx.state = 12;
                break;
              case 12:
                $ctx.state = (i < this.entries_.length) ? 8 : -2;
                break;
              case 4:
                i += 2;
                $ctx.state = 12;
                break;
              case 8:
                key = this.entries_[i];
                value = this.entries_[i + 1];
                $ctx.state = 9;
                break;
              case 9:
                $ctx.state = (key === deletedSentinel) ? 4 : 6;
                break;
              case 6:
                $ctx.state = 2;
                return [key, value];
              case 2:
                $ctx.maybeThrow();
                $ctx.state = 4;
                break;
              default:
                return $ctx.end();
            }
        }, $__12, this);
      }),
      keys: $traceurRuntime.initGeneratorFunction(function $__13() {
        var i,
            key,
            value;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
          while (true)
            switch ($ctx.state) {
              case 0:
                i = 0;
                $ctx.state = 12;
                break;
              case 12:
                $ctx.state = (i < this.entries_.length) ? 8 : -2;
                break;
              case 4:
                i += 2;
                $ctx.state = 12;
                break;
              case 8:
                key = this.entries_[i];
                value = this.entries_[i + 1];
                $ctx.state = 9;
                break;
              case 9:
                $ctx.state = (key === deletedSentinel) ? 4 : 6;
                break;
              case 6:
                $ctx.state = 2;
                return key;
              case 2:
                $ctx.maybeThrow();
                $ctx.state = 4;
                break;
              default:
                return $ctx.end();
            }
        }, $__13, this);
      }),
      values: $traceurRuntime.initGeneratorFunction(function $__14() {
        var i,
            key,
            value;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
          while (true)
            switch ($ctx.state) {
              case 0:
                i = 0;
                $ctx.state = 12;
                break;
              case 12:
                $ctx.state = (i < this.entries_.length) ? 8 : -2;
                break;
              case 4:
                i += 2;
                $ctx.state = 12;
                break;
              case 8:
                key = this.entries_[i];
                value = this.entries_[i + 1];
                $ctx.state = 9;
                break;
              case 9:
                $ctx.state = (key === deletedSentinel) ? 4 : 6;
                break;
              case 6:
                $ctx.state = 2;
                return value;
              case 2:
                $ctx.maybeThrow();
                $ctx.state = 4;
                break;
              default:
                return $ctx.end();
            }
        }, $__14, this);
      })
    }, {});
  }());
  Object.defineProperty(Map.prototype, Symbol.iterator, {
    configurable: true,
    writable: true,
    value: Map.prototype.entries
  });
  function polyfillMap(global) {
    var $__9 = global,
        Object = $__9.Object,
        Symbol = $__9.Symbol;
    if (!global.Map)
      global.Map = Map;
    var mapPrototype = global.Map.prototype;
    if (mapPrototype.entries === undefined)
      global.Map = Map;
    if (mapPrototype.entries) {
      maybeAddIterator(mapPrototype, mapPrototype.entries, Symbol);
      maybeAddIterator(Object.getPrototypeOf(new global.Map().entries()), function() {
        return this;
      }, Symbol);
    }
  }
  registerPolyfill(polyfillMap);
  return {
    get Map() {
      return Map;
    },
    get polyfillMap() {
      return polyfillMap;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Map.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Set.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Set.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      isObject = $__0.isObject,
      maybeAddIterator = $__0.maybeAddIterator,
      registerPolyfill = $__0.registerPolyfill;
  var Map = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Map.js").Map;
  var getOwnHashObject = $traceurRuntime.getOwnHashObject;
  var $hasOwnProperty = Object.prototype.hasOwnProperty;
  function initSet(set) {
    set.map_ = new Map();
  }
  var Set = (function() {
    function Set() {
      var iterable = arguments[0];
      if (!isObject(this))
        throw new TypeError('Set called on incompatible type');
      if ($hasOwnProperty.call(this, 'map_')) {
        throw new TypeError('Set can not be reentrantly initialised');
      }
      initSet(this);
      if (iterable !== null && iterable !== undefined) {
        var $__7 = true;
        var $__8 = false;
        var $__9 = undefined;
        try {
          for (var $__5 = void 0,
              $__4 = (iterable)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__7 = ($__5 = $__4.next()).done); $__7 = true) {
            var item = $__5.value;
            {
              this.add(item);
            }
          }
        } catch ($__10) {
          $__8 = true;
          $__9 = $__10;
        } finally {
          try {
            if (!$__7 && $__4.return != null) {
              $__4.return();
            }
          } finally {
            if ($__8) {
              throw $__9;
            }
          }
        }
      }
    }
    return ($traceurRuntime.createClass)(Set, {
      get size() {
        return this.map_.size;
      },
      has: function(key) {
        return this.map_.has(key);
      },
      add: function(key) {
        this.map_.set(key, key);
        return this;
      },
      delete: function(key) {
        return this.map_.delete(key);
      },
      clear: function() {
        return this.map_.clear();
      },
      forEach: function(callbackFn) {
        var thisArg = arguments[1];
        var $__2 = this;
        return this.map_.forEach((function(value, key) {
          callbackFn.call(thisArg, key, key, $__2);
        }));
      },
      values: $traceurRuntime.initGeneratorFunction(function $__12() {
        var $__13,
            $__14;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
          while (true)
            switch ($ctx.state) {
              case 0:
                $__13 = $ctx.wrapYieldStar(this.map_.keys()[Symbol.iterator]());
                $ctx.sent = void 0;
                $ctx.action = 'next';
                $ctx.state = 12;
                break;
              case 12:
                $__14 = $__13[$ctx.action]($ctx.sentIgnoreThrow);
                $ctx.state = 9;
                break;
              case 9:
                $ctx.state = ($__14.done) ? 3 : 2;
                break;
              case 3:
                $ctx.sent = $__14.value;
                $ctx.state = -2;
                break;
              case 2:
                $ctx.state = 12;
                return $__14.value;
              default:
                return $ctx.end();
            }
        }, $__12, this);
      }),
      entries: $traceurRuntime.initGeneratorFunction(function $__15() {
        var $__16,
            $__17;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
          while (true)
            switch ($ctx.state) {
              case 0:
                $__16 = $ctx.wrapYieldStar(this.map_.entries()[Symbol.iterator]());
                $ctx.sent = void 0;
                $ctx.action = 'next';
                $ctx.state = 12;
                break;
              case 12:
                $__17 = $__16[$ctx.action]($ctx.sentIgnoreThrow);
                $ctx.state = 9;
                break;
              case 9:
                $ctx.state = ($__17.done) ? 3 : 2;
                break;
              case 3:
                $ctx.sent = $__17.value;
                $ctx.state = -2;
                break;
              case 2:
                $ctx.state = 12;
                return $__17.value;
              default:
                return $ctx.end();
            }
        }, $__15, this);
      })
    }, {});
  }());
  Object.defineProperty(Set.prototype, Symbol.iterator, {
    configurable: true,
    writable: true,
    value: Set.prototype.values
  });
  Object.defineProperty(Set.prototype, 'keys', {
    configurable: true,
    writable: true,
    value: Set.prototype.values
  });
  function polyfillSet(global) {
    var $__11 = global,
        Object = $__11.Object,
        Symbol = $__11.Symbol;
    if (!global.Set)
      global.Set = Set;
    var setPrototype = global.Set.prototype;
    if (setPrototype.values) {
      maybeAddIterator(setPrototype, setPrototype.values, Symbol);
      maybeAddIterator(Object.getPrototypeOf(new global.Set().values()), function() {
        return this;
      }, Symbol);
    }
  }
  registerPolyfill(polyfillSet);
  return {
    get Set() {
      return Set;
    },
    get polyfillSet() {
      return polyfillSet;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Set.js" + '');
System.registerModule("traceur-runtime@0.0.88/node_modules/rsvp/lib/rsvp/asap.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/node_modules/rsvp/lib/rsvp/asap.js";
  var len = 0;
  function asap(callback, arg) {
    queue[len] = callback;
    queue[len + 1] = arg;
    len += 2;
    if (len === 2) {
      scheduleFlush();
    }
  }
  var $__default = asap;
  var browserGlobal = (typeof window !== 'undefined') ? window : {};
  var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
  var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';
  function useNextTick() {
    return function() {
      process.nextTick(flush);
    };
  }
  function useMutationObserver() {
    var iterations = 0;
    var observer = new BrowserMutationObserver(flush);
    var node = document.createTextNode('');
    observer.observe(node, {characterData: true});
    return function() {
      node.data = (iterations = ++iterations % 2);
    };
  }
  function useMessageChannel() {
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    return function() {
      channel.port2.postMessage(0);
    };
  }
  function useSetTimeout() {
    return function() {
      setTimeout(flush, 1);
    };
  }
  var queue = new Array(1000);
  function flush() {
    for (var i = 0; i < len; i += 2) {
      var callback = queue[i];
      var arg = queue[i + 1];
      callback(arg);
      queue[i] = undefined;
      queue[i + 1] = undefined;
    }
    len = 0;
  }
  var scheduleFlush;
  if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
    scheduleFlush = useNextTick();
  } else if (BrowserMutationObserver) {
    scheduleFlush = useMutationObserver();
  } else if (isWorker) {
    scheduleFlush = useMessageChannel();
  } else {
    scheduleFlush = useSetTimeout();
  }
  return {get default() {
      return $__default;
    }};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Promise.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Promise.js";
  var async = System.get("traceur-runtime@0.0.88/node_modules/rsvp/lib/rsvp/asap.js").default;
  var registerPolyfill = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js").registerPolyfill;
  var promiseRaw = {};
  function isPromise(x) {
    return x && typeof x === 'object' && x.status_ !== undefined;
  }
  function idResolveHandler(x) {
    return x;
  }
  function idRejectHandler(x) {
    throw x;
  }
  function chain(promise) {
    var onResolve = arguments[1] !== (void 0) ? arguments[1] : idResolveHandler;
    var onReject = arguments[2] !== (void 0) ? arguments[2] : idRejectHandler;
    var deferred = getDeferred(promise.constructor);
    switch (promise.status_) {
      case undefined:
        throw TypeError;
      case 0:
        promise.onResolve_.push(onResolve, deferred);
        promise.onReject_.push(onReject, deferred);
        break;
      case +1:
        promiseEnqueue(promise.value_, [onResolve, deferred]);
        break;
      case -1:
        promiseEnqueue(promise.value_, [onReject, deferred]);
        break;
    }
    return deferred.promise;
  }
  function getDeferred(C) {
    if (this === $Promise) {
      var promise = promiseInit(new $Promise(promiseRaw));
      return {
        promise: promise,
        resolve: (function(x) {
          promiseResolve(promise, x);
        }),
        reject: (function(r) {
          promiseReject(promise, r);
        })
      };
    } else {
      var result = {};
      result.promise = new C((function(resolve, reject) {
        result.resolve = resolve;
        result.reject = reject;
      }));
      return result;
    }
  }
  function promiseSet(promise, status, value, onResolve, onReject) {
    promise.status_ = status;
    promise.value_ = value;
    promise.onResolve_ = onResolve;
    promise.onReject_ = onReject;
    return promise;
  }
  function promiseInit(promise) {
    return promiseSet(promise, 0, undefined, [], []);
  }
  var Promise = (function() {
    function Promise(resolver) {
      if (resolver === promiseRaw)
        return ;
      if (typeof resolver !== 'function')
        throw new TypeError;
      var promise = promiseInit(this);
      try {
        resolver((function(x) {
          promiseResolve(promise, x);
        }), (function(r) {
          promiseReject(promise, r);
        }));
      } catch (e) {
        promiseReject(promise, e);
      }
    }
    return ($traceurRuntime.createClass)(Promise, {
      catch: function(onReject) {
        return this.then(undefined, onReject);
      },
      then: function(onResolve, onReject) {
        if (typeof onResolve !== 'function')
          onResolve = idResolveHandler;
        if (typeof onReject !== 'function')
          onReject = idRejectHandler;
        var that = this;
        var constructor = this.constructor;
        return chain(this, function(x) {
          x = promiseCoerce(constructor, x);
          return x === that ? onReject(new TypeError) : isPromise(x) ? x.then(onResolve, onReject) : onResolve(x);
        }, onReject);
      }
    }, {
      resolve: function(x) {
        if (this === $Promise) {
          if (isPromise(x)) {
            return x;
          }
          return promiseSet(new $Promise(promiseRaw), +1, x);
        } else {
          return new this(function(resolve, reject) {
            resolve(x);
          });
        }
      },
      reject: function(r) {
        if (this === $Promise) {
          return promiseSet(new $Promise(promiseRaw), -1, r);
        } else {
          return new this((function(resolve, reject) {
            reject(r);
          }));
        }
      },
      all: function(values) {
        var deferred = getDeferred(this);
        var resolutions = [];
        try {
          var makeCountdownFunction = function(i) {
            return (function(x) {
              resolutions[i] = x;
              if (--count === 0)
                deferred.resolve(resolutions);
            });
          };
          var count = 0;
          var i = 0;
          var $__6 = true;
          var $__7 = false;
          var $__8 = undefined;
          try {
            for (var $__4 = void 0,
                $__3 = (values)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__6 = ($__4 = $__3.next()).done); $__6 = true) {
              var value = $__4.value;
              {
                var countdownFunction = makeCountdownFunction(i);
                this.resolve(value).then(countdownFunction, (function(r) {
                  deferred.reject(r);
                }));
                ++i;
                ++count;
              }
            }
          } catch ($__9) {
            $__7 = true;
            $__8 = $__9;
          } finally {
            try {
              if (!$__6 && $__3.return != null) {
                $__3.return();
              }
            } finally {
              if ($__7) {
                throw $__8;
              }
            }
          }
          if (count === 0) {
            deferred.resolve(resolutions);
          }
        } catch (e) {
          deferred.reject(e);
        }
        return deferred.promise;
      },
      race: function(values) {
        var deferred = getDeferred(this);
        try {
          for (var i = 0; i < values.length; i++) {
            this.resolve(values[i]).then((function(x) {
              deferred.resolve(x);
            }), (function(r) {
              deferred.reject(r);
            }));
          }
        } catch (e) {
          deferred.reject(e);
        }
        return deferred.promise;
      }
    });
  }());
  var $Promise = Promise;
  var $PromiseReject = $Promise.reject;
  function promiseResolve(promise, x) {
    promiseDone(promise, +1, x, promise.onResolve_);
  }
  function promiseReject(promise, r) {
    promiseDone(promise, -1, r, promise.onReject_);
  }
  function promiseDone(promise, status, value, reactions) {
    if (promise.status_ !== 0)
      return ;
    promiseEnqueue(value, reactions);
    promiseSet(promise, status, value);
  }
  function promiseEnqueue(value, tasks) {
    async((function() {
      for (var i = 0; i < tasks.length; i += 2) {
        promiseHandle(value, tasks[i], tasks[i + 1]);
      }
    }));
  }
  function promiseHandle(value, handler, deferred) {
    try {
      var result = handler(value);
      if (result === deferred.promise)
        throw new TypeError;
      else if (isPromise(result))
        chain(result, deferred.resolve, deferred.reject);
      else
        deferred.resolve(result);
    } catch (e) {
      try {
        deferred.reject(e);
      } catch (e) {}
    }
  }
  var thenableSymbol = '@@thenable';
  function isObject(x) {
    return x && (typeof x === 'object' || typeof x === 'function');
  }
  function promiseCoerce(constructor, x) {
    if (!isPromise(x) && isObject(x)) {
      var then;
      try {
        then = x.then;
      } catch (r) {
        var promise = $PromiseReject.call(constructor, r);
        x[thenableSymbol] = promise;
        return promise;
      }
      if (typeof then === 'function') {
        var p = x[thenableSymbol];
        if (p) {
          return p;
        } else {
          var deferred = getDeferred(constructor);
          x[thenableSymbol] = deferred.promise;
          try {
            then.call(x, deferred.resolve, deferred.reject);
          } catch (r) {
            deferred.reject(r);
          }
          return deferred.promise;
        }
      }
    }
    return x;
  }
  function polyfillPromise(global) {
    if (!global.Promise)
      global.Promise = Promise;
  }
  registerPolyfill(polyfillPromise);
  return {
    get Promise() {
      return Promise;
    },
    get polyfillPromise() {
      return polyfillPromise;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Promise.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/StringIterator.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/StringIterator.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      createIteratorResultObject = $__0.createIteratorResultObject,
      isObject = $__0.isObject;
  var toProperty = $traceurRuntime.toProperty;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var iteratedString = Symbol('iteratedString');
  var stringIteratorNextIndex = Symbol('stringIteratorNextIndex');
  var StringIterator = (function() {
    var $__2;
    function StringIterator() {}
    return ($traceurRuntime.createClass)(StringIterator, ($__2 = {}, Object.defineProperty($__2, "next", {
      value: function() {
        var o = this;
        if (!isObject(o) || !hasOwnProperty.call(o, iteratedString)) {
          throw new TypeError('this must be a StringIterator object');
        }
        var s = o[toProperty(iteratedString)];
        if (s === undefined) {
          return createIteratorResultObject(undefined, true);
        }
        var position = o[toProperty(stringIteratorNextIndex)];
        var len = s.length;
        if (position >= len) {
          o[toProperty(iteratedString)] = undefined;
          return createIteratorResultObject(undefined, true);
        }
        var first = s.charCodeAt(position);
        var resultString;
        if (first < 0xD800 || first > 0xDBFF || position + 1 === len) {
          resultString = String.fromCharCode(first);
        } else {
          var second = s.charCodeAt(position + 1);
          if (second < 0xDC00 || second > 0xDFFF) {
            resultString = String.fromCharCode(first);
          } else {
            resultString = String.fromCharCode(first) + String.fromCharCode(second);
          }
        }
        o[toProperty(stringIteratorNextIndex)] = position + resultString.length;
        return createIteratorResultObject(resultString, false);
      },
      configurable: true,
      enumerable: true,
      writable: true
    }), Object.defineProperty($__2, Symbol.iterator, {
      value: function() {
        return this;
      },
      configurable: true,
      enumerable: true,
      writable: true
    }), $__2), {});
  }());
  function createStringIterator(string) {
    var s = String(string);
    var iterator = Object.create(StringIterator.prototype);
    iterator[toProperty(iteratedString)] = s;
    iterator[toProperty(stringIteratorNextIndex)] = 0;
    return iterator;
  }
  return {get createStringIterator() {
      return createStringIterator;
    }};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/String.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/String.js";
  var createStringIterator = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/StringIterator.js").createStringIterator;
  var $__1 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      maybeAddFunctions = $__1.maybeAddFunctions,
      maybeAddIterator = $__1.maybeAddIterator,
      registerPolyfill = $__1.registerPolyfill;
  var $toString = Object.prototype.toString;
  var $indexOf = String.prototype.indexOf;
  var $lastIndexOf = String.prototype.lastIndexOf;
  function startsWith(search) {
    var string = String(this);
    if (this == null || $toString.call(search) == '[object RegExp]') {
      throw TypeError();
    }
    var stringLength = string.length;
    var searchString = String(search);
    var searchLength = searchString.length;
    var position = arguments.length > 1 ? arguments[1] : undefined;
    var pos = position ? Number(position) : 0;
    if (isNaN(pos)) {
      pos = 0;
    }
    var start = Math.min(Math.max(pos, 0), stringLength);
    return $indexOf.call(string, searchString, pos) == start;
  }
  function endsWith(search) {
    var string = String(this);
    if (this == null || $toString.call(search) == '[object RegExp]') {
      throw TypeError();
    }
    var stringLength = string.length;
    var searchString = String(search);
    var searchLength = searchString.length;
    var pos = stringLength;
    if (arguments.length > 1) {
      var position = arguments[1];
      if (position !== undefined) {
        pos = position ? Number(position) : 0;
        if (isNaN(pos)) {
          pos = 0;
        }
      }
    }
    var end = Math.min(Math.max(pos, 0), stringLength);
    var start = end - searchLength;
    if (start < 0) {
      return false;
    }
    return $lastIndexOf.call(string, searchString, start) == start;
  }
  function includes(search) {
    if (this == null) {
      throw TypeError();
    }
    var string = String(this);
    if (search && $toString.call(search) == '[object RegExp]') {
      throw TypeError();
    }
    var stringLength = string.length;
    var searchString = String(search);
    var searchLength = searchString.length;
    var position = arguments.length > 1 ? arguments[1] : undefined;
    var pos = position ? Number(position) : 0;
    if (pos != pos) {
      pos = 0;
    }
    var start = Math.min(Math.max(pos, 0), stringLength);
    if (searchLength + start > stringLength) {
      return false;
    }
    return $indexOf.call(string, searchString, pos) != -1;
  }
  function repeat(count) {
    if (this == null) {
      throw TypeError();
    }
    var string = String(this);
    var n = count ? Number(count) : 0;
    if (isNaN(n)) {
      n = 0;
    }
    if (n < 0 || n == Infinity) {
      throw RangeError();
    }
    if (n == 0) {
      return '';
    }
    var result = '';
    while (n--) {
      result += string;
    }
    return result;
  }
  function codePointAt(position) {
    if (this == null) {
      throw TypeError();
    }
    var string = String(this);
    var size = string.length;
    var index = position ? Number(position) : 0;
    if (isNaN(index)) {
      index = 0;
    }
    if (index < 0 || index >= size) {
      return undefined;
    }
    var first = string.charCodeAt(index);
    var second;
    if (first >= 0xD800 && first <= 0xDBFF && size > index + 1) {
      second = string.charCodeAt(index + 1);
      if (second >= 0xDC00 && second <= 0xDFFF) {
        return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
      }
    }
    return first;
  }
  function raw(callsite) {
    var raw = callsite.raw;
    var len = raw.length >>> 0;
    if (len === 0)
      return '';
    var s = '';
    var i = 0;
    while (true) {
      s += raw[i];
      if (i + 1 === len)
        return s;
      s += arguments[++i];
    }
  }
  function fromCodePoint(_) {
    var codeUnits = [];
    var floor = Math.floor;
    var highSurrogate;
    var lowSurrogate;
    var index = -1;
    var length = arguments.length;
    if (!length) {
      return '';
    }
    while (++index < length) {
      var codePoint = Number(arguments[index]);
      if (!isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF || floor(codePoint) != codePoint) {
        throw RangeError('Invalid code point: ' + codePoint);
      }
      if (codePoint <= 0xFFFF) {
        codeUnits.push(codePoint);
      } else {
        codePoint -= 0x10000;
        highSurrogate = (codePoint >> 10) + 0xD800;
        lowSurrogate = (codePoint % 0x400) + 0xDC00;
        codeUnits.push(highSurrogate, lowSurrogate);
      }
    }
    return String.fromCharCode.apply(null, codeUnits);
  }
  function stringPrototypeIterator() {
    var o = $traceurRuntime.checkObjectCoercible(this);
    var s = String(o);
    return createStringIterator(s);
  }
  function polyfillString(global) {
    var String = global.String;
    maybeAddFunctions(String.prototype, ['codePointAt', codePointAt, 'endsWith', endsWith, 'includes', includes, 'repeat', repeat, 'startsWith', startsWith]);
    maybeAddFunctions(String, ['fromCodePoint', fromCodePoint, 'raw', raw]);
    maybeAddIterator(String.prototype, stringPrototypeIterator, Symbol);
  }
  registerPolyfill(polyfillString);
  return {
    get startsWith() {
      return startsWith;
    },
    get endsWith() {
      return endsWith;
    },
    get includes() {
      return includes;
    },
    get repeat() {
      return repeat;
    },
    get codePointAt() {
      return codePointAt;
    },
    get raw() {
      return raw;
    },
    get fromCodePoint() {
      return fromCodePoint;
    },
    get stringPrototypeIterator() {
      return stringPrototypeIterator;
    },
    get polyfillString() {
      return polyfillString;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/String.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/ArrayIterator.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/ArrayIterator.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      toObject = $__0.toObject,
      toUint32 = $__0.toUint32,
      createIteratorResultObject = $__0.createIteratorResultObject;
  var ARRAY_ITERATOR_KIND_KEYS = 1;
  var ARRAY_ITERATOR_KIND_VALUES = 2;
  var ARRAY_ITERATOR_KIND_ENTRIES = 3;
  var ArrayIterator = (function() {
    var $__2;
    function ArrayIterator() {}
    return ($traceurRuntime.createClass)(ArrayIterator, ($__2 = {}, Object.defineProperty($__2, "next", {
      value: function() {
        var iterator = toObject(this);
        var array = iterator.iteratorObject_;
        if (!array) {
          throw new TypeError('Object is not an ArrayIterator');
        }
        var index = iterator.arrayIteratorNextIndex_;
        var itemKind = iterator.arrayIterationKind_;
        var length = toUint32(array.length);
        if (index >= length) {
          iterator.arrayIteratorNextIndex_ = Infinity;
          return createIteratorResultObject(undefined, true);
        }
        iterator.arrayIteratorNextIndex_ = index + 1;
        if (itemKind == ARRAY_ITERATOR_KIND_VALUES)
          return createIteratorResultObject(array[index], false);
        if (itemKind == ARRAY_ITERATOR_KIND_ENTRIES)
          return createIteratorResultObject([index, array[index]], false);
        return createIteratorResultObject(index, false);
      },
      configurable: true,
      enumerable: true,
      writable: true
    }), Object.defineProperty($__2, Symbol.iterator, {
      value: function() {
        return this;
      },
      configurable: true,
      enumerable: true,
      writable: true
    }), $__2), {});
  }());
  function createArrayIterator(array, kind) {
    var object = toObject(array);
    var iterator = new ArrayIterator;
    iterator.iteratorObject_ = object;
    iterator.arrayIteratorNextIndex_ = 0;
    iterator.arrayIterationKind_ = kind;
    return iterator;
  }
  function entries() {
    return createArrayIterator(this, ARRAY_ITERATOR_KIND_ENTRIES);
  }
  function keys() {
    return createArrayIterator(this, ARRAY_ITERATOR_KIND_KEYS);
  }
  function values() {
    return createArrayIterator(this, ARRAY_ITERATOR_KIND_VALUES);
  }
  return {
    get entries() {
      return entries;
    },
    get keys() {
      return keys;
    },
    get values() {
      return values;
    }
  };
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Array.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Array.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/ArrayIterator.js"),
      entries = $__0.entries,
      keys = $__0.keys,
      jsValues = $__0.values;
  var $__1 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      checkIterable = $__1.checkIterable,
      isCallable = $__1.isCallable,
      isConstructor = $__1.isConstructor,
      maybeAddFunctions = $__1.maybeAddFunctions,
      maybeAddIterator = $__1.maybeAddIterator,
      registerPolyfill = $__1.registerPolyfill,
      toInteger = $__1.toInteger,
      toLength = $__1.toLength,
      toObject = $__1.toObject;
  function from(arrLike) {
    var mapFn = arguments[1];
    var thisArg = arguments[2];
    var C = this;
    var items = toObject(arrLike);
    var mapping = mapFn !== undefined;
    var k = 0;
    var arr,
        len;
    if (mapping && !isCallable(mapFn)) {
      throw TypeError();
    }
    if (checkIterable(items)) {
      arr = isConstructor(C) ? new C() : [];
      var $__5 = true;
      var $__6 = false;
      var $__7 = undefined;
      try {
        for (var $__3 = void 0,
            $__2 = (items)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
          var item = $__3.value;
          {
            if (mapping) {
              arr[k] = mapFn.call(thisArg, item, k);
            } else {
              arr[k] = item;
            }
            k++;
          }
        }
      } catch ($__8) {
        $__6 = true;
        $__7 = $__8;
      } finally {
        try {
          if (!$__5 && $__2.return != null) {
            $__2.return();
          }
        } finally {
          if ($__6) {
            throw $__7;
          }
        }
      }
      arr.length = k;
      return arr;
    }
    len = toLength(items.length);
    arr = isConstructor(C) ? new C(len) : new Array(len);
    for (; k < len; k++) {
      if (mapping) {
        arr[k] = typeof thisArg === 'undefined' ? mapFn(items[k], k) : mapFn.call(thisArg, items[k], k);
      } else {
        arr[k] = items[k];
      }
    }
    arr.length = len;
    return arr;
  }
  function of() {
    for (var items = [],
        $__9 = 0; $__9 < arguments.length; $__9++)
      items[$__9] = arguments[$__9];
    var C = this;
    var len = items.length;
    var arr = isConstructor(C) ? new C(len) : new Array(len);
    for (var k = 0; k < len; k++) {
      arr[k] = items[k];
    }
    arr.length = len;
    return arr;
  }
  function fill(value) {
    var start = arguments[1] !== (void 0) ? arguments[1] : 0;
    var end = arguments[2];
    var object = toObject(this);
    var len = toLength(object.length);
    var fillStart = toInteger(start);
    var fillEnd = end !== undefined ? toInteger(end) : len;
    fillStart = fillStart < 0 ? Math.max(len + fillStart, 0) : Math.min(fillStart, len);
    fillEnd = fillEnd < 0 ? Math.max(len + fillEnd, 0) : Math.min(fillEnd, len);
    while (fillStart < fillEnd) {
      object[fillStart] = value;
      fillStart++;
    }
    return object;
  }
  function find(predicate) {
    var thisArg = arguments[1];
    return findHelper(this, predicate, thisArg);
  }
  function findIndex(predicate) {
    var thisArg = arguments[1];
    return findHelper(this, predicate, thisArg, true);
  }
  function findHelper(self, predicate) {
    var thisArg = arguments[2];
    var returnIndex = arguments[3] !== (void 0) ? arguments[3] : false;
    var object = toObject(self);
    var len = toLength(object.length);
    if (!isCallable(predicate)) {
      throw TypeError();
    }
    for (var i = 0; i < len; i++) {
      var value = object[i];
      if (predicate.call(thisArg, value, i, object)) {
        return returnIndex ? i : value;
      }
    }
    return returnIndex ? -1 : undefined;
  }
  function polyfillArray(global) {
    var $__10 = global,
        Array = $__10.Array,
        Object = $__10.Object,
        Symbol = $__10.Symbol;
    var values = jsValues;
    if (Symbol && Symbol.iterator && Array.prototype[Symbol.iterator]) {
      values = Array.prototype[Symbol.iterator];
    }
    maybeAddFunctions(Array.prototype, ['entries', entries, 'keys', keys, 'values', values, 'fill', fill, 'find', find, 'findIndex', findIndex]);
    maybeAddFunctions(Array, ['from', from, 'of', of]);
    maybeAddIterator(Array.prototype, values, Symbol);
    maybeAddIterator(Object.getPrototypeOf([].values()), function() {
      return this;
    }, Symbol);
  }
  registerPolyfill(polyfillArray);
  return {
    get from() {
      return from;
    },
    get of() {
      return of;
    },
    get fill() {
      return fill;
    },
    get find() {
      return find;
    },
    get findIndex() {
      return findIndex;
    },
    get polyfillArray() {
      return polyfillArray;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Array.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Object.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Object.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      maybeAddFunctions = $__0.maybeAddFunctions,
      registerPolyfill = $__0.registerPolyfill;
  var $__1 = $traceurRuntime,
      defineProperty = $__1.defineProperty,
      getOwnPropertyDescriptor = $__1.getOwnPropertyDescriptor,
      getOwnPropertyNames = $__1.getOwnPropertyNames,
      isPrivateName = $__1.isPrivateName,
      keys = $__1.keys;
  function is(left, right) {
    if (left === right)
      return left !== 0 || 1 / left === 1 / right;
    return left !== left && right !== right;
  }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      var props = source == null ? [] : keys(source);
      var p = void 0,
          length = props.length;
      for (p = 0; p < length; p++) {
        var name = props[p];
        if (isPrivateName(name))
          continue;
        target[name] = source[name];
      }
    }
    return target;
  }
  function mixin(target, source) {
    var props = getOwnPropertyNames(source);
    var p,
        descriptor,
        length = props.length;
    for (p = 0; p < length; p++) {
      var name = props[p];
      if (isPrivateName(name))
        continue;
      descriptor = getOwnPropertyDescriptor(source, props[p]);
      defineProperty(target, props[p], descriptor);
    }
    return target;
  }
  function polyfillObject(global) {
    var Object = global.Object;
    maybeAddFunctions(Object, ['assign', assign, 'is', is, 'mixin', mixin]);
  }
  registerPolyfill(polyfillObject);
  return {
    get is() {
      return is;
    },
    get assign() {
      return assign;
    },
    get mixin() {
      return mixin;
    },
    get polyfillObject() {
      return polyfillObject;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Object.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Number.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Number.js";
  var $__0 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      isNumber = $__0.isNumber,
      maybeAddConsts = $__0.maybeAddConsts,
      maybeAddFunctions = $__0.maybeAddFunctions,
      registerPolyfill = $__0.registerPolyfill,
      toInteger = $__0.toInteger;
  var $abs = Math.abs;
  var $isFinite = isFinite;
  var $isNaN = isNaN;
  var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
  var MIN_SAFE_INTEGER = -Math.pow(2, 53) + 1;
  var EPSILON = Math.pow(2, -52);
  function NumberIsFinite(number) {
    return isNumber(number) && $isFinite(number);
  }
  function isInteger(number) {
    return NumberIsFinite(number) && toInteger(number) === number;
  }
  function NumberIsNaN(number) {
    return isNumber(number) && $isNaN(number);
  }
  function isSafeInteger(number) {
    if (NumberIsFinite(number)) {
      var integral = toInteger(number);
      if (integral === number)
        return $abs(integral) <= MAX_SAFE_INTEGER;
    }
    return false;
  }
  function polyfillNumber(global) {
    var Number = global.Number;
    maybeAddConsts(Number, ['MAX_SAFE_INTEGER', MAX_SAFE_INTEGER, 'MIN_SAFE_INTEGER', MIN_SAFE_INTEGER, 'EPSILON', EPSILON]);
    maybeAddFunctions(Number, ['isFinite', NumberIsFinite, 'isInteger', isInteger, 'isNaN', NumberIsNaN, 'isSafeInteger', isSafeInteger]);
  }
  registerPolyfill(polyfillNumber);
  return {
    get MAX_SAFE_INTEGER() {
      return MAX_SAFE_INTEGER;
    },
    get MIN_SAFE_INTEGER() {
      return MIN_SAFE_INTEGER;
    },
    get EPSILON() {
      return EPSILON;
    },
    get isFinite() {
      return NumberIsFinite;
    },
    get isInteger() {
      return isInteger;
    },
    get isNaN() {
      return NumberIsNaN;
    },
    get isSafeInteger() {
      return isSafeInteger;
    },
    get polyfillNumber() {
      return polyfillNumber;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Number.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/fround.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/fround.js";
  var $isFinite = isFinite;
  var $isNaN = isNaN;
  var $__0 = Math,
      LN2 = $__0.LN2,
      abs = $__0.abs,
      floor = $__0.floor,
      log = $__0.log,
      min = $__0.min,
      pow = $__0.pow;
  function packIEEE754(v, ebits, fbits) {
    var bias = (1 << (ebits - 1)) - 1,
        s,
        e,
        f,
        ln,
        i,
        bits,
        str,
        bytes;
    function roundToEven(n) {
      var w = floor(n),
          f = n - w;
      if (f < 0.5)
        return w;
      if (f > 0.5)
        return w + 1;
      return w % 2 ? w + 1 : w;
    }
    if (v !== v) {
      e = (1 << ebits) - 1;
      f = pow(2, fbits - 1);
      s = 0;
    } else if (v === Infinity || v === -Infinity) {
      e = (1 << ebits) - 1;
      f = 0;
      s = (v < 0) ? 1 : 0;
    } else if (v === 0) {
      e = 0;
      f = 0;
      s = (1 / v === -Infinity) ? 1 : 0;
    } else {
      s = v < 0;
      v = abs(v);
      if (v >= pow(2, 1 - bias)) {
        e = min(floor(log(v) / LN2), 1023);
        f = roundToEven(v / pow(2, e) * pow(2, fbits));
        if (f / pow(2, fbits) >= 2) {
          e = e + 1;
          f = 1;
        }
        if (e > bias) {
          e = (1 << ebits) - 1;
          f = 0;
        } else {
          e = e + bias;
          f = f - pow(2, fbits);
        }
      } else {
        e = 0;
        f = roundToEven(v / pow(2, 1 - bias - fbits));
      }
    }
    bits = [];
    for (i = fbits; i; i -= 1) {
      bits.push(f % 2 ? 1 : 0);
      f = floor(f / 2);
    }
    for (i = ebits; i; i -= 1) {
      bits.push(e % 2 ? 1 : 0);
      e = floor(e / 2);
    }
    bits.push(s ? 1 : 0);
    bits.reverse();
    str = bits.join('');
    bytes = [];
    while (str.length) {
      bytes.push(parseInt(str.substring(0, 8), 2));
      str = str.substring(8);
    }
    return bytes;
  }
  function unpackIEEE754(bytes, ebits, fbits) {
    var bits = [],
        i,
        j,
        b,
        str,
        bias,
        s,
        e,
        f;
    for (i = bytes.length; i; i -= 1) {
      b = bytes[i - 1];
      for (j = 8; j; j -= 1) {
        bits.push(b % 2 ? 1 : 0);
        b = b >> 1;
      }
    }
    bits.reverse();
    str = bits.join('');
    bias = (1 << (ebits - 1)) - 1;
    s = parseInt(str.substring(0, 1), 2) ? -1 : 1;
    e = parseInt(str.substring(1, 1 + ebits), 2);
    f = parseInt(str.substring(1 + ebits), 2);
    if (e === (1 << ebits) - 1) {
      return f !== 0 ? NaN : s * Infinity;
    } else if (e > 0) {
      return s * pow(2, e - bias) * (1 + f / pow(2, fbits));
    } else if (f !== 0) {
      return s * pow(2, -(bias - 1)) * (f / pow(2, fbits));
    } else {
      return s < 0 ? -0 : 0;
    }
  }
  function unpackF32(b) {
    return unpackIEEE754(b, 8, 23);
  }
  function packF32(v) {
    return packIEEE754(v, 8, 23);
  }
  function fround(x) {
    if (x === 0 || !$isFinite(x) || $isNaN(x)) {
      return x;
    }
    return unpackF32(packF32(Number(x)));
  }
  return {get fround() {
      return fround;
    }};
});
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/Math.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/Math.js";
  var jsFround = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/fround.js").fround;
  var $__1 = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js"),
      maybeAddFunctions = $__1.maybeAddFunctions,
      registerPolyfill = $__1.registerPolyfill,
      toUint32 = $__1.toUint32;
  var $isFinite = isFinite;
  var $isNaN = isNaN;
  var $__2 = Math,
      abs = $__2.abs,
      ceil = $__2.ceil,
      exp = $__2.exp,
      floor = $__2.floor,
      log = $__2.log,
      pow = $__2.pow,
      sqrt = $__2.sqrt;
  function clz32(x) {
    x = toUint32(+x);
    if (x == 0)
      return 32;
    var result = 0;
    if ((x & 0xFFFF0000) === 0) {
      x <<= 16;
      result += 16;
    }
    ;
    if ((x & 0xFF000000) === 0) {
      x <<= 8;
      result += 8;
    }
    ;
    if ((x & 0xF0000000) === 0) {
      x <<= 4;
      result += 4;
    }
    ;
    if ((x & 0xC0000000) === 0) {
      x <<= 2;
      result += 2;
    }
    ;
    if ((x & 0x80000000) === 0) {
      x <<= 1;
      result += 1;
    }
    ;
    return result;
  }
  function imul(x, y) {
    x = toUint32(+x);
    y = toUint32(+y);
    var xh = (x >>> 16) & 0xffff;
    var xl = x & 0xffff;
    var yh = (y >>> 16) & 0xffff;
    var yl = y & 0xffff;
    return xl * yl + (((xh * yl + xl * yh) << 16) >>> 0) | 0;
  }
  function sign(x) {
    x = +x;
    if (x > 0)
      return 1;
    if (x < 0)
      return -1;
    return x;
  }
  function log10(x) {
    return log(x) * 0.434294481903251828;
  }
  function log2(x) {
    return log(x) * 1.442695040888963407;
  }
  function log1p(x) {
    x = +x;
    if (x < -1 || $isNaN(x)) {
      return NaN;
    }
    if (x === 0 || x === Infinity) {
      return x;
    }
    if (x === -1) {
      return -Infinity;
    }
    var result = 0;
    var n = 50;
    if (x < 0 || x > 1) {
      return log(1 + x);
    }
    for (var i = 1; i < n; i++) {
      if ((i % 2) === 0) {
        result -= pow(x, i) / i;
      } else {
        result += pow(x, i) / i;
      }
    }
    return result;
  }
  function expm1(x) {
    x = +x;
    if (x === -Infinity) {
      return -1;
    }
    if (!$isFinite(x) || x === 0) {
      return x;
    }
    return exp(x) - 1;
  }
  function cosh(x) {
    x = +x;
    if (x === 0) {
      return 1;
    }
    if ($isNaN(x)) {
      return NaN;
    }
    if (!$isFinite(x)) {
      return Infinity;
    }
    if (x < 0) {
      x = -x;
    }
    if (x > 21) {
      return exp(x) / 2;
    }
    return (exp(x) + exp(-x)) / 2;
  }
  function sinh(x) {
    x = +x;
    if (!$isFinite(x) || x === 0) {
      return x;
    }
    return (exp(x) - exp(-x)) / 2;
  }
  function tanh(x) {
    x = +x;
    if (x === 0)
      return x;
    if (!$isFinite(x))
      return sign(x);
    var exp1 = exp(x);
    var exp2 = exp(-x);
    return (exp1 - exp2) / (exp1 + exp2);
  }
  function acosh(x) {
    x = +x;
    if (x < 1)
      return NaN;
    if (!$isFinite(x))
      return x;
    return log(x + sqrt(x + 1) * sqrt(x - 1));
  }
  function asinh(x) {
    x = +x;
    if (x === 0 || !$isFinite(x))
      return x;
    if (x > 0)
      return log(x + sqrt(x * x + 1));
    return -log(-x + sqrt(x * x + 1));
  }
  function atanh(x) {
    x = +x;
    if (x === -1) {
      return -Infinity;
    }
    if (x === 1) {
      return Infinity;
    }
    if (x === 0) {
      return x;
    }
    if ($isNaN(x) || x < -1 || x > 1) {
      return NaN;
    }
    return 0.5 * log((1 + x) / (1 - x));
  }
  function hypot(x, y) {
    var length = arguments.length;
    var args = new Array(length);
    var max = 0;
    for (var i = 0; i < length; i++) {
      var n = arguments[i];
      n = +n;
      if (n === Infinity || n === -Infinity)
        return Infinity;
      n = abs(n);
      if (n > max)
        max = n;
      args[i] = n;
    }
    if (max === 0)
      max = 1;
    var sum = 0;
    var compensation = 0;
    for (var i = 0; i < length; i++) {
      var n = args[i] / max;
      var summand = n * n - compensation;
      var preliminary = sum + summand;
      compensation = (preliminary - sum) - summand;
      sum = preliminary;
    }
    return sqrt(sum) * max;
  }
  function trunc(x) {
    x = +x;
    if (x > 0)
      return floor(x);
    if (x < 0)
      return ceil(x);
    return x;
  }
  var fround,
      f32;
  if (typeof Float32Array === 'function') {
    f32 = new Float32Array(1);
    fround = function(x) {
      f32[0] = Number(x);
      return f32[0];
    };
  } else {
    fround = jsFround;
  }
  function cbrt(x) {
    x = +x;
    if (x === 0)
      return x;
    var negate = x < 0;
    if (negate)
      x = -x;
    var result = pow(x, 1 / 3);
    return negate ? -result : result;
  }
  function polyfillMath(global) {
    var Math = global.Math;
    maybeAddFunctions(Math, ['acosh', acosh, 'asinh', asinh, 'atanh', atanh, 'cbrt', cbrt, 'clz32', clz32, 'cosh', cosh, 'expm1', expm1, 'fround', fround, 'hypot', hypot, 'imul', imul, 'log10', log10, 'log1p', log1p, 'log2', log2, 'sign', sign, 'sinh', sinh, 'tanh', tanh, 'trunc', trunc]);
  }
  registerPolyfill(polyfillMath);
  return {
    get clz32() {
      return clz32;
    },
    get imul() {
      return imul;
    },
    get sign() {
      return sign;
    },
    get log10() {
      return log10;
    },
    get log2() {
      return log2;
    },
    get log1p() {
      return log1p;
    },
    get expm1() {
      return expm1;
    },
    get cosh() {
      return cosh;
    },
    get sinh() {
      return sinh;
    },
    get tanh() {
      return tanh;
    },
    get acosh() {
      return acosh;
    },
    get asinh() {
      return asinh;
    },
    get atanh() {
      return atanh;
    },
    get hypot() {
      return hypot;
    },
    get trunc() {
      return trunc;
    },
    get fround() {
      return fround;
    },
    get cbrt() {
      return cbrt;
    },
    get polyfillMath() {
      return polyfillMath;
    }
  };
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/Math.js" + '');
System.registerModule("traceur-runtime@0.0.88/src/runtime/polyfills/polyfills.js", [], function() {
  "use strict";
  var __moduleName = "traceur-runtime@0.0.88/src/runtime/polyfills/polyfills.js";
  var polyfillAll = System.get("traceur-runtime@0.0.88/src/runtime/polyfills/utils.js").polyfillAll;
  polyfillAll(Reflect.global);
  var setupGlobals = $traceurRuntime.setupGlobals;
  $traceurRuntime.setupGlobals = function(global) {
    setupGlobals(global);
    polyfillAll(global);
  };
  return {};
});
System.get("traceur-runtime@0.0.88/src/runtime/polyfills/polyfills.js" + '');

(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare, execute) {
    if (typeof name != 'string')
      throw "System.register provided no module name";

    var entry;

    // dynamic
    if (typeof declare == 'boolean') {
      entry = {
        declarative: false,
        deps: deps,
        execute: execute,
        executingRequire: declare
      };
    }
    else {
      // ES6 declarative
      entry = {
        declarative: true,
        deps: deps,
        declare: declare
      };
    }

    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }

  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    if (!module.setters || !module.execute)
      throw new TypeError("Invalid System.register form for " + entry.name);

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        if (depEntry.module.exports && depEntry.module.exports.__esModule)
          depExports = depEntry.module.exports;
        else
          depExports = { 'default': depEntry.module.exports, __useDefault: true };
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    var module = entry.module.exports;

    if (!module || !entry.declarative && module.__esModule !== true)
      module = { 'default': module, __useDefault: true };

    // return the defined module object
    return modules[name] = module;
  };

  return function(mains, declare) {

    var System;
    var System = {
      register: register, 
      get: load, 
      set: function(name, module) {
        modules[name] = module; 
      },
      newModule: function(module) {
        return module;
      },
      global: global 
    };
    System.set('@empty', {});

    declare(System);

    for (var i = 0; i < mains.length; i++)
      load(mains[i]);
  }

})(typeof window != 'undefined' ? window : global)
/* (['mainModule'], function(System) {
  System.register(...);
}); */

(['main'], function(System) {

System.register("npm:process@0.10.1/browser", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  function drainQueue() {
    if (draining) {
      return ;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      var i = -1;
      while (++i < len) {
        currentQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  process.nextTick = function(fun) {
    queue.push(fun);
    if (!draining) {
      setTimeout(drainQueue, 0);
    }
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

System.register("github:firebase/firebase-bower@2.2.4/firebase", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  (function() {
    (function() {
      var h,
          aa = this;
      function n(a) {
        return void 0 !== a;
      }
      function ba() {}
      function ca(a) {
        a.ub = function() {
          return a.tf ? a.tf : a.tf = new a;
        };
      }
      function da(a) {
        var b = typeof a;
        if ("object" == b)
          if (a) {
            if (a instanceof Array)
              return "array";
            if (a instanceof Object)
              return b;
            var c = Object.prototype.toString.call(a);
            if ("[object Window]" == c)
              return "object";
            if ("[object Array]" == c || "number" == typeof a.length && "undefined" != typeof a.splice && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("splice"))
              return "array";
            if ("[object Function]" == c || "undefined" != typeof a.call && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("call"))
              return "function";
          } else
            return "null";
        else if ("function" == b && "undefined" == typeof a.call)
          return "object";
        return b;
      }
      function ea(a) {
        return "array" == da(a);
      }
      function fa(a) {
        var b = da(a);
        return "array" == b || "object" == b && "number" == typeof a.length;
      }
      function p(a) {
        return "string" == typeof a;
      }
      function ga(a) {
        return "number" == typeof a;
      }
      function ha(a) {
        return "function" == da(a);
      }
      function ia(a) {
        var b = typeof a;
        return "object" == b && null != a || "function" == b;
      }
      function ja(a, b, c) {
        return a.call.apply(a.bind, arguments);
      }
      function ka(a, b, c) {
        if (!a)
          throw Error();
        if (2 < arguments.length) {
          var d = Array.prototype.slice.call(arguments, 2);
          return function() {
            var c = Array.prototype.slice.call(arguments);
            Array.prototype.unshift.apply(c, d);
            return a.apply(b, c);
          };
        }
        return function() {
          return a.apply(b, arguments);
        };
      }
      function q(a, b, c) {
        q = Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf("native code") ? ja : ka;
        return q.apply(null, arguments);
      }
      var la = Date.now || function() {
        return +new Date;
      };
      function ma(a, b) {
        function c() {}
        c.prototype = b.prototype;
        a.Zg = b.prototype;
        a.prototype = new c;
        a.prototype.constructor = a;
        a.Vg = function(a, c, f) {
          for (var g = Array(arguments.length - 2),
              k = 2; k < arguments.length; k++)
            g[k - 2] = arguments[k];
          return b.prototype[c].apply(a, g);
        };
      }
      ;
      function r(a, b) {
        for (var c in a)
          b.call(void 0, a[c], c, a);
      }
      function na(a, b) {
        var c = {},
            d;
        for (d in a)
          c[d] = b.call(void 0, a[d], d, a);
        return c;
      }
      function oa(a, b) {
        for (var c in a)
          if (!b.call(void 0, a[c], c, a))
            return !1;
        return !0;
      }
      function pa(a) {
        var b = 0,
            c;
        for (c in a)
          b++;
        return b;
      }
      function qa(a) {
        for (var b in a)
          return b;
      }
      function ra(a) {
        var b = [],
            c = 0,
            d;
        for (d in a)
          b[c++] = a[d];
        return b;
      }
      function sa(a) {
        var b = [],
            c = 0,
            d;
        for (d in a)
          b[c++] = d;
        return b;
      }
      function ta(a, b) {
        for (var c in a)
          if (a[c] == b)
            return !0;
        return !1;
      }
      function ua(a, b, c) {
        for (var d in a)
          if (b.call(c, a[d], d, a))
            return d;
      }
      function va(a, b) {
        var c = ua(a, b, void 0);
        return c && a[c];
      }
      function wa(a) {
        for (var b in a)
          return !1;
        return !0;
      }
      function xa(a) {
        var b = {},
            c;
        for (c in a)
          b[c] = a[c];
        return b;
      }
      var ya = "constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
      function za(a, b) {
        for (var c,
            d,
            e = 1; e < arguments.length; e++) {
          d = arguments[e];
          for (c in d)
            a[c] = d[c];
          for (var f = 0; f < ya.length; f++)
            c = ya[f], Object.prototype.hasOwnProperty.call(d, c) && (a[c] = d[c]);
        }
      }
      ;
      function Aa(a) {
        a = String(a);
        if (/^\s*$/.test(a) ? 0 : /^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, "@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x0a-\x1f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, "")))
          try {
            return eval("(" + a + ")");
          } catch (b) {}
        throw Error("Invalid JSON string: " + a);
      }
      function Ba() {
        this.Pd = void 0;
      }
      function Ca(a, b, c) {
        switch (typeof b) {
          case "string":
            Da(b, c);
            break;
          case "number":
            c.push(isFinite(b) && !isNaN(b) ? b : "null");
            break;
          case "boolean":
            c.push(b);
            break;
          case "undefined":
            c.push("null");
            break;
          case "object":
            if (null == b) {
              c.push("null");
              break;
            }
            if (ea(b)) {
              var d = b.length;
              c.push("[");
              for (var e = "",
                  f = 0; f < d; f++)
                c.push(e), e = b[f], Ca(a, a.Pd ? a.Pd.call(b, String(f), e) : e, c), e = ",";
              c.push("]");
              break;
            }
            c.push("{");
            d = "";
            for (f in b)
              Object.prototype.hasOwnProperty.call(b, f) && (e = b[f], "function" != typeof e && (c.push(d), Da(f, c), c.push(":"), Ca(a, a.Pd ? a.Pd.call(b, f, e) : e, c), d = ","));
            c.push("}");
            break;
          case "function":
            break;
          default:
            throw Error("Unknown type: " + typeof b);
        }
      }
      var Ea = {
        '"': '\\"',
        "\\": "\\\\",
        "/": "\\/",
        "\b": "\\b",
        "\f": "\\f",
        "\n": "\\n",
        "\r": "\\r",
        "\t": "\\t",
        "\x0B": "\\u000b"
      },
          Fa = /\uffff/.test("\uffff") ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
      function Da(a, b) {
        b.push('"', a.replace(Fa, function(a) {
          if (a in Ea)
            return Ea[a];
          var b = a.charCodeAt(0),
              e = "\\u";
          16 > b ? e += "000" : 256 > b ? e += "00" : 4096 > b && (e += "0");
          return Ea[a] = e + b.toString(16);
        }), '"');
      }
      ;
      function Ga() {
        return Math.floor(2147483648 * Math.random()).toString(36) + Math.abs(Math.floor(2147483648 * Math.random()) ^ la()).toString(36);
      }
      ;
      var Ha;
      a: {
        var Ia = aa.navigator;
        if (Ia) {
          var Ja = Ia.userAgent;
          if (Ja) {
            Ha = Ja;
            break a;
          }
        }
        Ha = "";
      }
      ;
      function Ka() {
        this.Wa = -1;
      }
      ;
      function La() {
        this.Wa = -1;
        this.Wa = 64;
        this.R = [];
        this.le = [];
        this.Tf = [];
        this.Id = [];
        this.Id[0] = 128;
        for (var a = 1; a < this.Wa; ++a)
          this.Id[a] = 0;
        this.be = this.$b = 0;
        this.reset();
      }
      ma(La, Ka);
      La.prototype.reset = function() {
        this.R[0] = 1732584193;
        this.R[1] = 4023233417;
        this.R[2] = 2562383102;
        this.R[3] = 271733878;
        this.R[4] = 3285377520;
        this.be = this.$b = 0;
      };
      function Ma(a, b, c) {
        c || (c = 0);
        var d = a.Tf;
        if (p(b))
          for (var e = 0; 16 > e; e++)
            d[e] = b.charCodeAt(c) << 24 | b.charCodeAt(c + 1) << 16 | b.charCodeAt(c + 2) << 8 | b.charCodeAt(c + 3), c += 4;
        else
          for (e = 0; 16 > e; e++)
            d[e] = b[c] << 24 | b[c + 1] << 16 | b[c + 2] << 8 | b[c + 3], c += 4;
        for (e = 16; 80 > e; e++) {
          var f = d[e - 3] ^ d[e - 8] ^ d[e - 14] ^ d[e - 16];
          d[e] = (f << 1 | f >>> 31) & 4294967295;
        }
        b = a.R[0];
        c = a.R[1];
        for (var g = a.R[2],
            k = a.R[3],
            l = a.R[4],
            m,
            e = 0; 80 > e; e++)
          40 > e ? 20 > e ? (f = k ^ c & (g ^ k), m = 1518500249) : (f = c ^ g ^ k, m = 1859775393) : 60 > e ? (f = c & g | k & (c | g), m = 2400959708) : (f = c ^ g ^ k, m = 3395469782), f = (b << 5 | b >>> 27) + f + l + m + d[e] & 4294967295, l = k, k = g, g = (c << 30 | c >>> 2) & 4294967295, c = b, b = f;
        a.R[0] = a.R[0] + b & 4294967295;
        a.R[1] = a.R[1] + c & 4294967295;
        a.R[2] = a.R[2] + g & 4294967295;
        a.R[3] = a.R[3] + k & 4294967295;
        a.R[4] = a.R[4] + l & 4294967295;
      }
      La.prototype.update = function(a, b) {
        if (null != a) {
          n(b) || (b = a.length);
          for (var c = b - this.Wa,
              d = 0,
              e = this.le,
              f = this.$b; d < b; ) {
            if (0 == f)
              for (; d <= c; )
                Ma(this, a, d), d += this.Wa;
            if (p(a))
              for (; d < b; ) {
                if (e[f] = a.charCodeAt(d), ++f, ++d, f == this.Wa) {
                  Ma(this, e);
                  f = 0;
                  break;
                }
              }
            else
              for (; d < b; )
                if (e[f] = a[d], ++f, ++d, f == this.Wa) {
                  Ma(this, e);
                  f = 0;
                  break;
                }
          }
          this.$b = f;
          this.be += b;
        }
      };
      var t = Array.prototype,
          Na = t.indexOf ? function(a, b, c) {
            return t.indexOf.call(a, b, c);
          } : function(a, b, c) {
            c = null == c ? 0 : 0 > c ? Math.max(0, a.length + c) : c;
            if (p(a))
              return p(b) && 1 == b.length ? a.indexOf(b, c) : -1;
            for (; c < a.length; c++)
              if (c in a && a[c] === b)
                return c;
            return -1;
          },
          Oa = t.forEach ? function(a, b, c) {
            t.forEach.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = p(a) ? a.split("") : a,
                f = 0; f < d; f++)
              f in e && b.call(c, e[f], f, a);
          },
          Pa = t.filter ? function(a, b, c) {
            return t.filter.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = [],
                f = 0,
                g = p(a) ? a.split("") : a,
                k = 0; k < d; k++)
              if (k in g) {
                var l = g[k];
                b.call(c, l, k, a) && (e[f++] = l);
              }
            return e;
          },
          Qa = t.map ? function(a, b, c) {
            return t.map.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = Array(d),
                f = p(a) ? a.split("") : a,
                g = 0; g < d; g++)
              g in f && (e[g] = b.call(c, f[g], g, a));
            return e;
          },
          Ra = t.reduce ? function(a, b, c, d) {
            for (var e = [],
                f = 1,
                g = arguments.length; f < g; f++)
              e.push(arguments[f]);
            d && (e[0] = q(b, d));
            return t.reduce.apply(a, e);
          } : function(a, b, c, d) {
            var e = c;
            Oa(a, function(c, g) {
              e = b.call(d, e, c, g, a);
            });
            return e;
          },
          Sa = t.every ? function(a, b, c) {
            return t.every.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = p(a) ? a.split("") : a,
                f = 0; f < d; f++)
              if (f in e && !b.call(c, e[f], f, a))
                return !1;
            return !0;
          };
      function Ta(a, b) {
        var c = Ua(a, b, void 0);
        return 0 > c ? null : p(a) ? a.charAt(c) : a[c];
      }
      function Ua(a, b, c) {
        for (var d = a.length,
            e = p(a) ? a.split("") : a,
            f = 0; f < d; f++)
          if (f in e && b.call(c, e[f], f, a))
            return f;
        return -1;
      }
      function Va(a, b) {
        var c = Na(a, b);
        0 <= c && t.splice.call(a, c, 1);
      }
      function Wa(a, b, c) {
        return 2 >= arguments.length ? t.slice.call(a, b) : t.slice.call(a, b, c);
      }
      function Xa(a, b) {
        a.sort(b || Ya);
      }
      function Ya(a, b) {
        return a > b ? 1 : a < b ? -1 : 0;
      }
      ;
      var Za = -1 != Ha.indexOf("Opera") || -1 != Ha.indexOf("OPR"),
          $a = -1 != Ha.indexOf("Trident") || -1 != Ha.indexOf("MSIE"),
          ab = -1 != Ha.indexOf("Gecko") && -1 == Ha.toLowerCase().indexOf("webkit") && !(-1 != Ha.indexOf("Trident") || -1 != Ha.indexOf("MSIE")),
          bb = -1 != Ha.toLowerCase().indexOf("webkit");
      (function() {
        var a = "",
            b;
        if (Za && aa.opera)
          return a = aa.opera.version, ha(a) ? a() : a;
        ab ? b = /rv\:([^\);]+)(\)|;)/ : $a ? b = /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/ : bb && (b = /WebKit\/(\S+)/);
        b && (a = (a = b.exec(Ha)) ? a[1] : "");
        return $a && (b = (b = aa.document) ? b.documentMode : void 0, b > parseFloat(a)) ? String(b) : a;
      })();
      var cb = null,
          db = null,
          eb = null;
      function fb(a, b) {
        if (!fa(a))
          throw Error("encodeByteArray takes an array as a parameter");
        gb();
        for (var c = b ? db : cb,
            d = [],
            e = 0; e < a.length; e += 3) {
          var f = a[e],
              g = e + 1 < a.length,
              k = g ? a[e + 1] : 0,
              l = e + 2 < a.length,
              m = l ? a[e + 2] : 0,
              v = f >> 2,
              f = (f & 3) << 4 | k >> 4,
              k = (k & 15) << 2 | m >> 6,
              m = m & 63;
          l || (m = 64, g || (k = 64));
          d.push(c[v], c[f], c[k], c[m]);
        }
        return d.join("");
      }
      function gb() {
        if (!cb) {
          cb = {};
          db = {};
          eb = {};
          for (var a = 0; 65 > a; a++)
            cb[a] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a), db[a] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.".charAt(a), eb[db[a]] = a, 62 <= a && (eb["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a)] = a);
        }
      }
      ;
      function u(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
      }
      function w(a, b) {
        if (Object.prototype.hasOwnProperty.call(a, b))
          return a[b];
      }
      function hb(a, b) {
        for (var c in a)
          Object.prototype.hasOwnProperty.call(a, c) && b(c, a[c]);
      }
      function ib(a) {
        var b = {};
        hb(a, function(a, d) {
          b[a] = d;
        });
        return b;
      }
      ;
      function jb(a) {
        var b = [];
        hb(a, function(a, d) {
          ea(d) ? Oa(d, function(d) {
            b.push(encodeURIComponent(a) + "=" + encodeURIComponent(d));
          }) : b.push(encodeURIComponent(a) + "=" + encodeURIComponent(d));
        });
        return b.length ? "&" + b.join("&") : "";
      }
      function kb(a) {
        var b = {};
        a = a.replace(/^\?/, "").split("&");
        Oa(a, function(a) {
          a && (a = a.split("="), b[a[0]] = a[1]);
        });
        return b;
      }
      ;
      function x(a, b, c, d) {
        var e;
        d < b ? e = "at least " + b : d > c && (e = 0 === c ? "none" : "no more than " + c);
        if (e)
          throw Error(a + " failed: Was called with " + d + (1 === d ? " argument." : " arguments.") + " Expects " + e + ".");
      }
      function z(a, b, c) {
        var d = "";
        switch (b) {
          case 1:
            d = c ? "first" : "First";
            break;
          case 2:
            d = c ? "second" : "Second";
            break;
          case 3:
            d = c ? "third" : "Third";
            break;
          case 4:
            d = c ? "fourth" : "Fourth";
            break;
          default:
            throw Error("errorPrefix called with argumentNumber > 4.  Need to update it?");
        }
        return a = a + " failed: " + (d + " argument ");
      }
      function A(a, b, c, d) {
        if ((!d || n(c)) && !ha(c))
          throw Error(z(a, b, d) + "must be a valid function.");
      }
      function lb(a, b, c) {
        if (n(c) && (!ia(c) || null === c))
          throw Error(z(a, b, !0) + "must be a valid context object.");
      }
      ;
      function mb(a) {
        return "undefined" !== typeof JSON && n(JSON.parse) ? JSON.parse(a) : Aa(a);
      }
      function B(a) {
        if ("undefined" !== typeof JSON && n(JSON.stringify))
          a = JSON.stringify(a);
        else {
          var b = [];
          Ca(new Ba, a, b);
          a = b.join("");
        }
        return a;
      }
      ;
      function nb() {
        this.Sd = C;
      }
      nb.prototype.j = function(a) {
        return this.Sd.oa(a);
      };
      nb.prototype.toString = function() {
        return this.Sd.toString();
      };
      function ob() {}
      ob.prototype.pf = function() {
        return null;
      };
      ob.prototype.xe = function() {
        return null;
      };
      var pb = new ob;
      function qb(a, b, c) {
        this.Qf = a;
        this.Ka = b;
        this.Hd = c;
      }
      qb.prototype.pf = function(a) {
        var b = this.Ka.D;
        if (rb(b, a))
          return b.j().M(a);
        b = null != this.Hd ? new sb(this.Hd, !0, !1) : this.Ka.u();
        return this.Qf.Xa(a, b);
      };
      qb.prototype.xe = function(a, b, c) {
        var d = null != this.Hd ? this.Hd : tb(this.Ka);
        a = this.Qf.me(d, b, 1, c, a);
        return 0 === a.length ? null : a[0];
      };
      function ub() {
        this.tb = [];
      }
      function vb(a, b) {
        for (var c = null,
            d = 0; d < b.length; d++) {
          var e = b[d],
              f = e.Yb();
          null === c || f.Z(c.Yb()) || (a.tb.push(c), c = null);
          null === c && (c = new wb(f));
          c.add(e);
        }
        c && a.tb.push(c);
      }
      function xb(a, b, c) {
        vb(a, c);
        yb(a, function(a) {
          return a.Z(b);
        });
      }
      function zb(a, b, c) {
        vb(a, c);
        yb(a, function(a) {
          return a.contains(b) || b.contains(a);
        });
      }
      function yb(a, b) {
        for (var c = !0,
            d = 0; d < a.tb.length; d++) {
          var e = a.tb[d];
          if (e)
            if (e = e.Yb(), b(e)) {
              for (var e = a.tb[d],
                  f = 0; f < e.sd.length; f++) {
                var g = e.sd[f];
                if (null !== g) {
                  e.sd[f] = null;
                  var k = g.Ub();
                  Ab && Bb("event: " + g.toString());
                  Cb(k);
                }
              }
              a.tb[d] = null;
            } else
              c = !1;
        }
        c && (a.tb = []);
      }
      function wb(a) {
        this.qa = a;
        this.sd = [];
      }
      wb.prototype.add = function(a) {
        this.sd.push(a);
      };
      wb.prototype.Yb = function() {
        return this.qa;
      };
      function D(a, b, c, d) {
        this.type = a;
        this.Ja = b;
        this.Ya = c;
        this.Je = d;
        this.Nd = void 0;
      }
      function Db(a) {
        return new D(Eb, a);
      }
      var Eb = "value";
      function Fb(a, b, c, d) {
        this.te = b;
        this.Wd = c;
        this.Nd = d;
        this.rd = a;
      }
      Fb.prototype.Yb = function() {
        var a = this.Wd.lc();
        return "value" === this.rd ? a.path : a.parent().path;
      };
      Fb.prototype.ye = function() {
        return this.rd;
      };
      Fb.prototype.Ub = function() {
        return this.te.Ub(this);
      };
      Fb.prototype.toString = function() {
        return this.Yb().toString() + ":" + this.rd + ":" + B(this.Wd.lf());
      };
      function Gb(a, b, c) {
        this.te = a;
        this.error = b;
        this.path = c;
      }
      Gb.prototype.Yb = function() {
        return this.path;
      };
      Gb.prototype.ye = function() {
        return "cancel";
      };
      Gb.prototype.Ub = function() {
        return this.te.Ub(this);
      };
      Gb.prototype.toString = function() {
        return this.path.toString() + ":cancel";
      };
      function sb(a, b, c) {
        this.B = a;
        this.$ = b;
        this.Tb = c;
      }
      function Hb(a) {
        return a.$;
      }
      function rb(a, b) {
        return a.$ && !a.Tb || a.B.Ha(b);
      }
      sb.prototype.j = function() {
        return this.B;
      };
      function Ib(a) {
        this.dg = a;
        this.Ad = null;
      }
      Ib.prototype.get = function() {
        var a = this.dg.get(),
            b = xa(a);
        if (this.Ad)
          for (var c in this.Ad)
            b[c] -= this.Ad[c];
        this.Ad = a;
        return b;
      };
      function Jb(a, b) {
        this.Mf = {};
        this.Yd = new Ib(a);
        this.ca = b;
        var c = 1E4 + 2E4 * Math.random();
        setTimeout(q(this.Hf, this), Math.floor(c));
      }
      Jb.prototype.Hf = function() {
        var a = this.Yd.get(),
            b = {},
            c = !1,
            d;
        for (d in a)
          0 < a[d] && u(this.Mf, d) && (b[d] = a[d], c = !0);
        c && this.ca.Te(b);
        setTimeout(q(this.Hf, this), Math.floor(6E5 * Math.random()));
      };
      function Kb() {
        this.Dc = {};
      }
      function Lb(a, b, c) {
        n(c) || (c = 1);
        u(a.Dc, b) || (a.Dc[b] = 0);
        a.Dc[b] += c;
      }
      Kb.prototype.get = function() {
        return xa(this.Dc);
      };
      var Mb = {},
          Nb = {};
      function Ob(a) {
        a = a.toString();
        Mb[a] || (Mb[a] = new Kb);
        return Mb[a];
      }
      function Pb(a, b) {
        var c = a.toString();
        Nb[c] || (Nb[c] = b());
        return Nb[c];
      }
      ;
      function E(a, b) {
        this.name = a;
        this.S = b;
      }
      function Qb(a, b) {
        return new E(a, b);
      }
      ;
      function Rb(a, b) {
        return Sb(a.name, b.name);
      }
      function Tb(a, b) {
        return Sb(a, b);
      }
      ;
      function Ub(a, b, c) {
        this.type = Vb;
        this.source = a;
        this.path = b;
        this.Ia = c;
      }
      Ub.prototype.Wc = function(a) {
        return this.path.e() ? new Ub(this.source, F, this.Ia.M(a)) : new Ub(this.source, G(this.path), this.Ia);
      };
      Ub.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " overwrite: " + this.Ia.toString() + ")";
      };
      function Wb(a, b) {
        this.type = Xb;
        this.source = Yb;
        this.path = a;
        this.Ve = b;
      }
      Wb.prototype.Wc = function() {
        return this.path.e() ? this : new Wb(G(this.path), this.Ve);
      };
      Wb.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " ack write revert=" + this.Ve + ")";
      };
      function Zb(a, b) {
        this.type = $b;
        this.source = a;
        this.path = b;
      }
      Zb.prototype.Wc = function() {
        return this.path.e() ? new Zb(this.source, F) : new Zb(this.source, G(this.path));
      };
      Zb.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " listen_complete)";
      };
      function ac(a, b) {
        this.La = a;
        this.xa = b ? b : bc;
      }
      h = ac.prototype;
      h.Na = function(a, b) {
        return new ac(this.La, this.xa.Na(a, b, this.La).X(null, null, !1, null, null));
      };
      h.remove = function(a) {
        return new ac(this.La, this.xa.remove(a, this.La).X(null, null, !1, null, null));
      };
      h.get = function(a) {
        for (var b,
            c = this.xa; !c.e(); ) {
          b = this.La(a, c.key);
          if (0 === b)
            return c.value;
          0 > b ? c = c.left : 0 < b && (c = c.right);
        }
        return null;
      };
      function cc(a, b) {
        for (var c,
            d = a.xa,
            e = null; !d.e(); ) {
          c = a.La(b, d.key);
          if (0 === c) {
            if (d.left.e())
              return e ? e.key : null;
            for (d = d.left; !d.right.e(); )
              d = d.right;
            return d.key;
          }
          0 > c ? d = d.left : 0 < c && (e = d, d = d.right);
        }
        throw Error("Attempted to find predecessor key for a nonexistent key.  What gives?");
      }
      h.e = function() {
        return this.xa.e();
      };
      h.count = function() {
        return this.xa.count();
      };
      h.Rc = function() {
        return this.xa.Rc();
      };
      h.ec = function() {
        return this.xa.ec();
      };
      h.ha = function(a) {
        return this.xa.ha(a);
      };
      h.Wb = function(a) {
        return new dc(this.xa, null, this.La, !1, a);
      };
      h.Xb = function(a, b) {
        return new dc(this.xa, a, this.La, !1, b);
      };
      h.Zb = function(a, b) {
        return new dc(this.xa, a, this.La, !0, b);
      };
      h.rf = function(a) {
        return new dc(this.xa, null, this.La, !0, a);
      };
      function dc(a, b, c, d, e) {
        this.Rd = e || null;
        this.Ee = d;
        this.Pa = [];
        for (e = 1; !a.e(); )
          if (e = b ? c(a.key, b) : 1, d && (e *= -1), 0 > e)
            a = this.Ee ? a.left : a.right;
          else if (0 === e) {
            this.Pa.push(a);
            break;
          } else
            this.Pa.push(a), a = this.Ee ? a.right : a.left;
      }
      function H(a) {
        if (0 === a.Pa.length)
          return null;
        var b = a.Pa.pop(),
            c;
        c = a.Rd ? a.Rd(b.key, b.value) : {
          key: b.key,
          value: b.value
        };
        if (a.Ee)
          for (b = b.left; !b.e(); )
            a.Pa.push(b), b = b.right;
        else
          for (b = b.right; !b.e(); )
            a.Pa.push(b), b = b.left;
        return c;
      }
      function ec(a) {
        if (0 === a.Pa.length)
          return null;
        var b;
        b = a.Pa;
        b = b[b.length - 1];
        return a.Rd ? a.Rd(b.key, b.value) : {
          key: b.key,
          value: b.value
        };
      }
      function fc(a, b, c, d, e) {
        this.key = a;
        this.value = b;
        this.color = null != c ? c : !0;
        this.left = null != d ? d : bc;
        this.right = null != e ? e : bc;
      }
      h = fc.prototype;
      h.X = function(a, b, c, d, e) {
        return new fc(null != a ? a : this.key, null != b ? b : this.value, null != c ? c : this.color, null != d ? d : this.left, null != e ? e : this.right);
      };
      h.count = function() {
        return this.left.count() + 1 + this.right.count();
      };
      h.e = function() {
        return !1;
      };
      h.ha = function(a) {
        return this.left.ha(a) || a(this.key, this.value) || this.right.ha(a);
      };
      function gc(a) {
        return a.left.e() ? a : gc(a.left);
      }
      h.Rc = function() {
        return gc(this).key;
      };
      h.ec = function() {
        return this.right.e() ? this.key : this.right.ec();
      };
      h.Na = function(a, b, c) {
        var d,
            e;
        e = this;
        d = c(a, e.key);
        e = 0 > d ? e.X(null, null, null, e.left.Na(a, b, c), null) : 0 === d ? e.X(null, b, null, null, null) : e.X(null, null, null, null, e.right.Na(a, b, c));
        return hc(e);
      };
      function ic(a) {
        if (a.left.e())
          return bc;
        a.left.fa() || a.left.left.fa() || (a = jc(a));
        a = a.X(null, null, null, ic(a.left), null);
        return hc(a);
      }
      h.remove = function(a, b) {
        var c,
            d;
        c = this;
        if (0 > b(a, c.key))
          c.left.e() || c.left.fa() || c.left.left.fa() || (c = jc(c)), c = c.X(null, null, null, c.left.remove(a, b), null);
        else {
          c.left.fa() && (c = kc(c));
          c.right.e() || c.right.fa() || c.right.left.fa() || (c = lc(c), c.left.left.fa() && (c = kc(c), c = lc(c)));
          if (0 === b(a, c.key)) {
            if (c.right.e())
              return bc;
            d = gc(c.right);
            c = c.X(d.key, d.value, null, null, ic(c.right));
          }
          c = c.X(null, null, null, null, c.right.remove(a, b));
        }
        return hc(c);
      };
      h.fa = function() {
        return this.color;
      };
      function hc(a) {
        a.right.fa() && !a.left.fa() && (a = mc(a));
        a.left.fa() && a.left.left.fa() && (a = kc(a));
        a.left.fa() && a.right.fa() && (a = lc(a));
        return a;
      }
      function jc(a) {
        a = lc(a);
        a.right.left.fa() && (a = a.X(null, null, null, null, kc(a.right)), a = mc(a), a = lc(a));
        return a;
      }
      function mc(a) {
        return a.right.X(null, null, a.color, a.X(null, null, !0, null, a.right.left), null);
      }
      function kc(a) {
        return a.left.X(null, null, a.color, null, a.X(null, null, !0, a.left.right, null));
      }
      function lc(a) {
        return a.X(null, null, !a.color, a.left.X(null, null, !a.left.color, null, null), a.right.X(null, null, !a.right.color, null, null));
      }
      function nc() {}
      h = nc.prototype;
      h.X = function() {
        return this;
      };
      h.Na = function(a, b) {
        return new fc(a, b, null);
      };
      h.remove = function() {
        return this;
      };
      h.count = function() {
        return 0;
      };
      h.e = function() {
        return !0;
      };
      h.ha = function() {
        return !1;
      };
      h.Rc = function() {
        return null;
      };
      h.ec = function() {
        return null;
      };
      h.fa = function() {
        return !1;
      };
      var bc = new nc;
      function oc(a, b) {
        return a && "object" === typeof a ? (J(".sv" in a, "Unexpected leaf node or priority contents"), b[a[".sv"]]) : a;
      }
      function pc(a, b) {
        var c = new qc;
        rc(a, new K(""), function(a, e) {
          c.mc(a, sc(e, b));
        });
        return c;
      }
      function sc(a, b) {
        var c = a.A().K(),
            c = oc(c, b),
            d;
        if (a.N()) {
          var e = oc(a.Ba(), b);
          return e !== a.Ba() || c !== a.A().K() ? new tc(e, L(c)) : a;
        }
        d = a;
        c !== a.A().K() && (d = d.da(new tc(c)));
        a.U(M, function(a, c) {
          var e = sc(c, b);
          e !== c && (d = d.Q(a, e));
        });
        return d;
      }
      ;
      function K(a, b) {
        if (1 == arguments.length) {
          this.o = a.split("/");
          for (var c = 0,
              d = 0; d < this.o.length; d++)
            0 < this.o[d].length && (this.o[c] = this.o[d], c++);
          this.o.length = c;
          this.Y = 0;
        } else
          this.o = a, this.Y = b;
      }
      function N(a, b) {
        var c = O(a);
        if (null === c)
          return b;
        if (c === O(b))
          return N(G(a), G(b));
        throw Error("INTERNAL ERROR: innerPath (" + b + ") is not within outerPath (" + a + ")");
      }
      function O(a) {
        return a.Y >= a.o.length ? null : a.o[a.Y];
      }
      function uc(a) {
        return a.o.length - a.Y;
      }
      function G(a) {
        var b = a.Y;
        b < a.o.length && b++;
        return new K(a.o, b);
      }
      function vc(a) {
        return a.Y < a.o.length ? a.o[a.o.length - 1] : null;
      }
      h = K.prototype;
      h.toString = function() {
        for (var a = "",
            b = this.Y; b < this.o.length; b++)
          "" !== this.o[b] && (a += "/" + this.o[b]);
        return a || "/";
      };
      h.slice = function(a) {
        return this.o.slice(this.Y + (a || 0));
      };
      h.parent = function() {
        if (this.Y >= this.o.length)
          return null;
        for (var a = [],
            b = this.Y; b < this.o.length - 1; b++)
          a.push(this.o[b]);
        return new K(a, 0);
      };
      h.w = function(a) {
        for (var b = [],
            c = this.Y; c < this.o.length; c++)
          b.push(this.o[c]);
        if (a instanceof K)
          for (c = a.Y; c < a.o.length; c++)
            b.push(a.o[c]);
        else
          for (a = a.split("/"), c = 0; c < a.length; c++)
            0 < a[c].length && b.push(a[c]);
        return new K(b, 0);
      };
      h.e = function() {
        return this.Y >= this.o.length;
      };
      h.Z = function(a) {
        if (uc(this) !== uc(a))
          return !1;
        for (var b = this.Y,
            c = a.Y; b <= this.o.length; b++, c++)
          if (this.o[b] !== a.o[c])
            return !1;
        return !0;
      };
      h.contains = function(a) {
        var b = this.Y,
            c = a.Y;
        if (uc(this) > uc(a))
          return !1;
        for (; b < this.o.length; ) {
          if (this.o[b] !== a.o[c])
            return !1;
          ++b;
          ++c;
        }
        return !0;
      };
      var F = new K("");
      function wc(a, b) {
        this.Qa = a.slice();
        this.Ea = Math.max(1, this.Qa.length);
        this.kf = b;
        for (var c = 0; c < this.Qa.length; c++)
          this.Ea += xc(this.Qa[c]);
        yc(this);
      }
      wc.prototype.push = function(a) {
        0 < this.Qa.length && (this.Ea += 1);
        this.Qa.push(a);
        this.Ea += xc(a);
        yc(this);
      };
      wc.prototype.pop = function() {
        var a = this.Qa.pop();
        this.Ea -= xc(a);
        0 < this.Qa.length && --this.Ea;
      };
      function yc(a) {
        if (768 < a.Ea)
          throw Error(a.kf + "has a key path longer than 768 bytes (" + a.Ea + ").");
        if (32 < a.Qa.length)
          throw Error(a.kf + "path specified exceeds the maximum depth that can be written (32) or object contains a cycle " + zc(a));
      }
      function zc(a) {
        return 0 == a.Qa.length ? "" : "in property '" + a.Qa.join(".") + "'";
      }
      ;
      function Ac() {
        this.wc = {};
      }
      Ac.prototype.set = function(a, b) {
        null == b ? delete this.wc[a] : this.wc[a] = b;
      };
      Ac.prototype.get = function(a) {
        return u(this.wc, a) ? this.wc[a] : null;
      };
      Ac.prototype.remove = function(a) {
        delete this.wc[a];
      };
      Ac.prototype.uf = !0;
      function Bc(a) {
        this.Ec = a;
        this.Md = "firebase:";
      }
      h = Bc.prototype;
      h.set = function(a, b) {
        null == b ? this.Ec.removeItem(this.Md + a) : this.Ec.setItem(this.Md + a, B(b));
      };
      h.get = function(a) {
        a = this.Ec.getItem(this.Md + a);
        return null == a ? null : mb(a);
      };
      h.remove = function(a) {
        this.Ec.removeItem(this.Md + a);
      };
      h.uf = !1;
      h.toString = function() {
        return this.Ec.toString();
      };
      function Cc(a) {
        try {
          if ("undefined" !== typeof window && "undefined" !== typeof window[a]) {
            var b = window[a];
            b.setItem("firebase:sentinel", "cache");
            b.removeItem("firebase:sentinel");
            return new Bc(b);
          }
        } catch (c) {}
        return new Ac;
      }
      var Dc = Cc("localStorage"),
          P = Cc("sessionStorage");
      function Ec(a, b, c, d, e) {
        this.host = a.toLowerCase();
        this.domain = this.host.substr(this.host.indexOf(".") + 1);
        this.lb = b;
        this.Cb = c;
        this.Tg = d;
        this.Ld = e || "";
        this.Oa = Dc.get("host:" + a) || this.host;
      }
      function Fc(a, b) {
        b !== a.Oa && (a.Oa = b, "s-" === a.Oa.substr(0, 2) && Dc.set("host:" + a.host, a.Oa));
      }
      Ec.prototype.toString = function() {
        var a = (this.lb ? "https://" : "http://") + this.host;
        this.Ld && (a += "<" + this.Ld + ">");
        return a;
      };
      var Gc = function() {
        var a = 1;
        return function() {
          return a++;
        };
      }();
      function J(a, b) {
        if (!a)
          throw Hc(b);
      }
      function Hc(a) {
        return Error("Firebase (2.2.4) INTERNAL ASSERT FAILED: " + a);
      }
      function Ic(a) {
        try {
          var b;
          if ("undefined" !== typeof atob)
            b = atob(a);
          else {
            gb();
            for (var c = eb,
                d = [],
                e = 0; e < a.length; ) {
              var f = c[a.charAt(e++)],
                  g = e < a.length ? c[a.charAt(e)] : 0;
              ++e;
              var k = e < a.length ? c[a.charAt(e)] : 64;
              ++e;
              var l = e < a.length ? c[a.charAt(e)] : 64;
              ++e;
              if (null == f || null == g || null == k || null == l)
                throw Error();
              d.push(f << 2 | g >> 4);
              64 != k && (d.push(g << 4 & 240 | k >> 2), 64 != l && d.push(k << 6 & 192 | l));
            }
            if (8192 > d.length)
              b = String.fromCharCode.apply(null, d);
            else {
              a = "";
              for (c = 0; c < d.length; c += 8192)
                a += String.fromCharCode.apply(null, Wa(d, c, c + 8192));
              b = a;
            }
          }
          return b;
        } catch (m) {
          Bb("base64Decode failed: ", m);
        }
        return null;
      }
      function Jc(a) {
        var b = Kc(a);
        a = new La;
        a.update(b);
        var b = [],
            c = 8 * a.be;
        56 > a.$b ? a.update(a.Id, 56 - a.$b) : a.update(a.Id, a.Wa - (a.$b - 56));
        for (var d = a.Wa - 1; 56 <= d; d--)
          a.le[d] = c & 255, c /= 256;
        Ma(a, a.le);
        for (d = c = 0; 5 > d; d++)
          for (var e = 24; 0 <= e; e -= 8)
            b[c] = a.R[d] >> e & 255, ++c;
        return fb(b);
      }
      function Lc(a) {
        for (var b = "",
            c = 0; c < arguments.length; c++)
          b = fa(arguments[c]) ? b + Lc.apply(null, arguments[c]) : "object" === typeof arguments[c] ? b + B(arguments[c]) : b + arguments[c], b += " ";
        return b;
      }
      var Ab = null,
          Mc = !0;
      function Bb(a) {
        !0 === Mc && (Mc = !1, null === Ab && !0 === P.get("logging_enabled") && Nc(!0));
        if (Ab) {
          var b = Lc.apply(null, arguments);
          Ab(b);
        }
      }
      function Oc(a) {
        return function() {
          Bb(a, arguments);
        };
      }
      function Pc(a) {
        if ("undefined" !== typeof console) {
          var b = "FIREBASE INTERNAL ERROR: " + Lc.apply(null, arguments);
          "undefined" !== typeof console.error ? console.error(b) : console.log(b);
        }
      }
      function Qc(a) {
        var b = Lc.apply(null, arguments);
        throw Error("FIREBASE FATAL ERROR: " + b);
      }
      function Q(a) {
        if ("undefined" !== typeof console) {
          var b = "FIREBASE WARNING: " + Lc.apply(null, arguments);
          "undefined" !== typeof console.warn ? console.warn(b) : console.log(b);
        }
      }
      function Rc(a) {
        var b = "",
            c = "",
            d = "",
            e = "",
            f = !0,
            g = "https",
            k = 443;
        if (p(a)) {
          var l = a.indexOf("//");
          0 <= l && (g = a.substring(0, l - 1), a = a.substring(l + 2));
          l = a.indexOf("/");
          -1 === l && (l = a.length);
          b = a.substring(0, l);
          e = "";
          a = a.substring(l).split("/");
          for (l = 0; l < a.length; l++)
            if (0 < a[l].length) {
              var m = a[l];
              try {
                m = decodeURIComponent(m.replace(/\+/g, " "));
              } catch (v) {}
              e += "/" + m;
            }
          a = b.split(".");
          3 === a.length ? (c = a[1], d = a[0].toLowerCase()) : 2 === a.length && (c = a[0]);
          l = b.indexOf(":");
          0 <= l && (f = "https" === g || "wss" === g, k = b.substring(l + 1), isFinite(k) && (k = String(k)), k = p(k) ? /^\s*-?0x/i.test(k) ? parseInt(k, 16) : parseInt(k, 10) : NaN);
        }
        return {
          host: b,
          port: k,
          domain: c,
          Qg: d,
          lb: f,
          scheme: g,
          Zc: e
        };
      }
      function Sc(a) {
        return ga(a) && (a != a || a == Number.POSITIVE_INFINITY || a == Number.NEGATIVE_INFINITY);
      }
      function Tc(a) {
        if ("complete" === document.readyState)
          a();
        else {
          var b = !1,
              c = function() {
                document.body ? b || (b = !0, a()) : setTimeout(c, Math.floor(10));
              };
          document.addEventListener ? (document.addEventListener("DOMContentLoaded", c, !1), window.addEventListener("load", c, !1)) : document.attachEvent && (document.attachEvent("onreadystatechange", function() {
            "complete" === document.readyState && c();
          }), window.attachEvent("onload", c));
        }
      }
      function Sb(a, b) {
        if (a === b)
          return 0;
        if ("[MIN_NAME]" === a || "[MAX_NAME]" === b)
          return -1;
        if ("[MIN_NAME]" === b || "[MAX_NAME]" === a)
          return 1;
        var c = Uc(a),
            d = Uc(b);
        return null !== c ? null !== d ? 0 == c - d ? a.length - b.length : c - d : -1 : null !== d ? 1 : a < b ? -1 : 1;
      }
      function Vc(a, b) {
        if (b && a in b)
          return b[a];
        throw Error("Missing required key (" + a + ") in object: " + B(b));
      }
      function Wc(a) {
        if ("object" !== typeof a || null === a)
          return B(a);
        var b = [],
            c;
        for (c in a)
          b.push(c);
        b.sort();
        c = "{";
        for (var d = 0; d < b.length; d++)
          0 !== d && (c += ","), c += B(b[d]), c += ":", c += Wc(a[b[d]]);
        return c + "}";
      }
      function Xc(a, b) {
        if (a.length <= b)
          return [a];
        for (var c = [],
            d = 0; d < a.length; d += b)
          d + b > a ? c.push(a.substring(d, a.length)) : c.push(a.substring(d, d + b));
        return c;
      }
      function Yc(a, b) {
        if (ea(a))
          for (var c = 0; c < a.length; ++c)
            b(c, a[c]);
        else
          r(a, b);
      }
      function Zc(a) {
        J(!Sc(a), "Invalid JSON number");
        var b,
            c,
            d,
            e;
        0 === a ? (d = c = 0, b = -Infinity === 1 / a ? 1 : 0) : (b = 0 > a, a = Math.abs(a), a >= Math.pow(2, -1022) ? (d = Math.min(Math.floor(Math.log(a) / Math.LN2), 1023), c = d + 1023, d = Math.round(a * Math.pow(2, 52 - d) - Math.pow(2, 52))) : (c = 0, d = Math.round(a / Math.pow(2, -1074))));
        e = [];
        for (a = 52; a; --a)
          e.push(d % 2 ? 1 : 0), d = Math.floor(d / 2);
        for (a = 11; a; --a)
          e.push(c % 2 ? 1 : 0), c = Math.floor(c / 2);
        e.push(b ? 1 : 0);
        e.reverse();
        b = e.join("");
        c = "";
        for (a = 0; 64 > a; a += 8)
          d = parseInt(b.substr(a, 8), 2).toString(16), 1 === d.length && (d = "0" + d), c += d;
        return c.toLowerCase();
      }
      var $c = /^-?\d{1,10}$/;
      function Uc(a) {
        return $c.test(a) && (a = Number(a), -2147483648 <= a && 2147483647 >= a) ? a : null;
      }
      function Cb(a) {
        try {
          a();
        } catch (b) {
          setTimeout(function() {
            Q("Exception was thrown by user callback.", b.stack || "");
            throw b;
          }, Math.floor(0));
        }
      }
      function R(a, b) {
        if (ha(a)) {
          var c = Array.prototype.slice.call(arguments, 1).slice();
          Cb(function() {
            a.apply(null, c);
          });
        }
      }
      ;
      function Kc(a) {
        for (var b = [],
            c = 0,
            d = 0; d < a.length; d++) {
          var e = a.charCodeAt(d);
          55296 <= e && 56319 >= e && (e -= 55296, d++, J(d < a.length, "Surrogate pair missing trail surrogate."), e = 65536 + (e << 10) + (a.charCodeAt(d) - 56320));
          128 > e ? b[c++] = e : (2048 > e ? b[c++] = e >> 6 | 192 : (65536 > e ? b[c++] = e >> 12 | 224 : (b[c++] = e >> 18 | 240, b[c++] = e >> 12 & 63 | 128), b[c++] = e >> 6 & 63 | 128), b[c++] = e & 63 | 128);
        }
        return b;
      }
      function xc(a) {
        for (var b = 0,
            c = 0; c < a.length; c++) {
          var d = a.charCodeAt(c);
          128 > d ? b++ : 2048 > d ? b += 2 : 55296 <= d && 56319 >= d ? (b += 4, c++) : b += 3;
        }
        return b;
      }
      ;
      function ad(a) {
        var b = {},
            c = {},
            d = {},
            e = "";
        try {
          var f = a.split("."),
              b = mb(Ic(f[0]) || ""),
              c = mb(Ic(f[1]) || ""),
              e = f[2],
              d = c.d || {};
          delete c.d;
        } catch (g) {}
        return {
          Wg: b,
          Ac: c,
          data: d,
          Ng: e
        };
      }
      function bd(a) {
        a = ad(a).Ac;
        return "object" === typeof a && a.hasOwnProperty("iat") ? w(a, "iat") : null;
      }
      function cd(a) {
        a = ad(a);
        var b = a.Ac;
        return !!a.Ng && !!b && "object" === typeof b && b.hasOwnProperty("iat");
      }
      ;
      function dd(a) {
        this.V = a;
        this.g = a.n.g;
      }
      function ed(a, b, c, d) {
        var e = [],
            f = [];
        Oa(b, function(b) {
          "child_changed" === b.type && a.g.xd(b.Je, b.Ja) && f.push(new D("child_moved", b.Ja, b.Ya));
        });
        fd(a, e, "child_removed", b, d, c);
        fd(a, e, "child_added", b, d, c);
        fd(a, e, "child_moved", f, d, c);
        fd(a, e, "child_changed", b, d, c);
        fd(a, e, Eb, b, d, c);
        return e;
      }
      function fd(a, b, c, d, e, f) {
        d = Pa(d, function(a) {
          return a.type === c;
        });
        Xa(d, q(a.eg, a));
        Oa(d, function(c) {
          var d = gd(a, c, f);
          Oa(e, function(e) {
            e.Jf(c.type) && b.push(e.createEvent(d, a.V));
          });
        });
      }
      function gd(a, b, c) {
        "value" !== b.type && "child_removed" !== b.type && (b.Nd = c.qf(b.Ya, b.Ja, a.g));
        return b;
      }
      dd.prototype.eg = function(a, b) {
        if (null == a.Ya || null == b.Ya)
          throw Hc("Should only compare child_ events.");
        return this.g.compare(new E(a.Ya, a.Ja), new E(b.Ya, b.Ja));
      };
      function hd() {
        this.eb = {};
      }
      function id(a, b) {
        var c = b.type,
            d = b.Ya;
        J("child_added" == c || "child_changed" == c || "child_removed" == c, "Only child changes supported for tracking");
        J(".priority" !== d, "Only non-priority child changes can be tracked.");
        var e = w(a.eb, d);
        if (e) {
          var f = e.type;
          if ("child_added" == c && "child_removed" == f)
            a.eb[d] = new D("child_changed", b.Ja, d, e.Ja);
          else if ("child_removed" == c && "child_added" == f)
            delete a.eb[d];
          else if ("child_removed" == c && "child_changed" == f)
            a.eb[d] = new D("child_removed", e.Je, d);
          else if ("child_changed" == c && "child_added" == f)
            a.eb[d] = new D("child_added", b.Ja, d);
          else if ("child_changed" == c && "child_changed" == f)
            a.eb[d] = new D("child_changed", b.Ja, d, e.Je);
          else
            throw Hc("Illegal combination of changes: " + b + " occurred after " + e);
        } else
          a.eb[d] = b;
      }
      ;
      function jd(a, b, c) {
        this.Pb = a;
        this.qb = b;
        this.sb = c || null;
      }
      h = jd.prototype;
      h.Jf = function(a) {
        return "value" === a;
      };
      h.createEvent = function(a, b) {
        var c = b.n.g;
        return new Fb("value", this, new S(a.Ja, b.lc(), c));
      };
      h.Ub = function(a) {
        var b = this.sb;
        if ("cancel" === a.ye()) {
          J(this.qb, "Raising a cancel event on a listener with no cancel callback");
          var c = this.qb;
          return function() {
            c.call(b, a.error);
          };
        }
        var d = this.Pb;
        return function() {
          d.call(b, a.Wd);
        };
      };
      h.ff = function(a, b) {
        return this.qb ? new Gb(this, a, b) : null;
      };
      h.matches = function(a) {
        return a instanceof jd ? a.Pb && this.Pb ? a.Pb === this.Pb && a.sb === this.sb : !0 : !1;
      };
      h.sf = function() {
        return null !== this.Pb;
      };
      function kd(a, b, c) {
        this.ga = a;
        this.qb = b;
        this.sb = c;
      }
      h = kd.prototype;
      h.Jf = function(a) {
        a = "children_added" === a ? "child_added" : a;
        return ("children_removed" === a ? "child_removed" : a) in this.ga;
      };
      h.ff = function(a, b) {
        return this.qb ? new Gb(this, a, b) : null;
      };
      h.createEvent = function(a, b) {
        J(null != a.Ya, "Child events should have a childName.");
        var c = b.lc().w(a.Ya);
        return new Fb(a.type, this, new S(a.Ja, c, b.n.g), a.Nd);
      };
      h.Ub = function(a) {
        var b = this.sb;
        if ("cancel" === a.ye()) {
          J(this.qb, "Raising a cancel event on a listener with no cancel callback");
          var c = this.qb;
          return function() {
            c.call(b, a.error);
          };
        }
        var d = this.ga[a.rd];
        return function() {
          d.call(b, a.Wd, a.Nd);
        };
      };
      h.matches = function(a) {
        if (a instanceof kd) {
          if (!this.ga || !a.ga)
            return !0;
          if (this.sb === a.sb) {
            var b = pa(a.ga);
            if (b === pa(this.ga)) {
              if (1 === b) {
                var b = qa(a.ga),
                    c = qa(this.ga);
                return c === b && (!a.ga[b] || !this.ga[c] || a.ga[b] === this.ga[c]);
              }
              return oa(this.ga, function(b, c) {
                return a.ga[c] === b;
              });
            }
          }
        }
        return !1;
      };
      h.sf = function() {
        return null !== this.ga;
      };
      function ld(a) {
        this.g = a;
      }
      h = ld.prototype;
      h.G = function(a, b, c, d, e) {
        J(a.Ic(this.g), "A node must be indexed if only a child is updated");
        d = a.M(b);
        if (d.Z(c))
          return a;
        null != e && (c.e() ? a.Ha(b) ? id(e, new D("child_removed", d, b)) : J(a.N(), "A child remove without an old child only makes sense on a leaf node") : d.e() ? id(e, new D("child_added", c, b)) : id(e, new D("child_changed", c, b, d)));
        return a.N() && c.e() ? a : a.Q(b, c).mb(this.g);
      };
      h.ta = function(a, b, c) {
        null != c && (a.N() || a.U(M, function(a, e) {
          b.Ha(a) || id(c, new D("child_removed", e, a));
        }), b.N() || b.U(M, function(b, e) {
          if (a.Ha(b)) {
            var f = a.M(b);
            f.Z(e) || id(c, new D("child_changed", e, b, f));
          } else
            id(c, new D("child_added", e, b));
        }));
        return b.mb(this.g);
      };
      h.da = function(a, b) {
        return a.e() ? C : a.da(b);
      };
      h.Ga = function() {
        return !1;
      };
      h.Vb = function() {
        return this;
      };
      function md(a) {
        this.Ae = new ld(a.g);
        this.g = a.g;
        var b;
        a.la ? (b = nd(a), b = a.g.Oc(od(a), b)) : b = a.g.Sc();
        this.dd = b;
        a.na ? (b = pd(a), a = a.g.Oc(qd(a), b)) : a = a.g.Pc();
        this.Fc = a;
      }
      h = md.prototype;
      h.matches = function(a) {
        return 0 >= this.g.compare(this.dd, a) && 0 >= this.g.compare(a, this.Fc);
      };
      h.G = function(a, b, c, d, e) {
        this.matches(new E(b, c)) || (c = C);
        return this.Ae.G(a, b, c, d, e);
      };
      h.ta = function(a, b, c) {
        b.N() && (b = C);
        var d = b.mb(this.g),
            d = d.da(C),
            e = this;
        b.U(M, function(a, b) {
          e.matches(new E(a, b)) || (d = d.Q(a, C));
        });
        return this.Ae.ta(a, d, c);
      };
      h.da = function(a) {
        return a;
      };
      h.Ga = function() {
        return !0;
      };
      h.Vb = function() {
        return this.Ae;
      };
      function rd(a) {
        this.ra = new md(a);
        this.g = a.g;
        J(a.ia, "Only valid if limit has been set");
        this.ja = a.ja;
        this.Jb = !sd(a);
      }
      h = rd.prototype;
      h.G = function(a, b, c, d, e) {
        this.ra.matches(new E(b, c)) || (c = C);
        return a.M(b).Z(c) ? a : a.Db() < this.ja ? this.ra.Vb().G(a, b, c, d, e) : td(this, a, b, c, d, e);
      };
      h.ta = function(a, b, c) {
        var d;
        if (b.N() || b.e())
          d = C.mb(this.g);
        else if (2 * this.ja < b.Db() && b.Ic(this.g)) {
          d = C.mb(this.g);
          b = this.Jb ? b.Zb(this.ra.Fc, this.g) : b.Xb(this.ra.dd, this.g);
          for (var e = 0; 0 < b.Pa.length && e < this.ja; ) {
            var f = H(b),
                g;
            if (g = this.Jb ? 0 >= this.g.compare(this.ra.dd, f) : 0 >= this.g.compare(f, this.ra.Fc))
              d = d.Q(f.name, f.S), e++;
            else
              break;
          }
        } else {
          d = b.mb(this.g);
          d = d.da(C);
          var k,
              l,
              m;
          if (this.Jb) {
            b = d.rf(this.g);
            k = this.ra.Fc;
            l = this.ra.dd;
            var v = ud(this.g);
            m = function(a, b) {
              return v(b, a);
            };
          } else
            b = d.Wb(this.g), k = this.ra.dd, l = this.ra.Fc, m = ud(this.g);
          for (var e = 0,
              y = !1; 0 < b.Pa.length; )
            f = H(b), !y && 0 >= m(k, f) && (y = !0), (g = y && e < this.ja && 0 >= m(f, l)) ? e++ : d = d.Q(f.name, C);
        }
        return this.ra.Vb().ta(a, d, c);
      };
      h.da = function(a) {
        return a;
      };
      h.Ga = function() {
        return !0;
      };
      h.Vb = function() {
        return this.ra.Vb();
      };
      function td(a, b, c, d, e, f) {
        var g;
        if (a.Jb) {
          var k = ud(a.g);
          g = function(a, b) {
            return k(b, a);
          };
        } else
          g = ud(a.g);
        J(b.Db() == a.ja, "");
        var l = new E(c, d),
            m = a.Jb ? wd(b, a.g) : xd(b, a.g),
            v = a.ra.matches(l);
        if (b.Ha(c)) {
          var y = b.M(c),
              m = e.xe(a.g, m, a.Jb);
          null != m && m.name == c && (m = e.xe(a.g, m, a.Jb));
          e = null == m ? 1 : g(m, l);
          if (v && !d.e() && 0 <= e)
            return null != f && id(f, new D("child_changed", d, c, y)), b.Q(c, d);
          null != f && id(f, new D("child_removed", y, c));
          b = b.Q(c, C);
          return null != m && a.ra.matches(m) ? (null != f && id(f, new D("child_added", m.S, m.name)), b.Q(m.name, m.S)) : b;
        }
        return d.e() ? b : v && 0 <= g(m, l) ? (null != f && (id(f, new D("child_removed", m.S, m.name)), id(f, new D("child_added", d, c))), b.Q(c, d).Q(m.name, C)) : b;
      }
      ;
      function yd(a, b) {
        this.he = a;
        this.cg = b;
      }
      function zd(a) {
        this.I = a;
      }
      zd.prototype.bb = function(a, b, c, d) {
        var e = new hd,
            f;
        if (b.type === Vb)
          b.source.ve ? c = Ad(this, a, b.path, b.Ia, c, d, e) : (J(b.source.of, "Unknown source."), f = b.source.af, c = Bd(this, a, b.path, b.Ia, c, d, f, e));
        else if (b.type === Cd)
          b.source.ve ? c = Dd(this, a, b.path, b.children, c, d, e) : (J(b.source.of, "Unknown source."), f = b.source.af, c = Ed(this, a, b.path, b.children, c, d, f, e));
        else if (b.type === Xb)
          if (b.Ve)
            if (f = b.path, null != c.sc(f))
              c = a;
            else {
              b = new qb(c, a, d);
              d = a.D.j();
              if (f.e() || ".priority" === O(f))
                Hb(a.u()) ? b = c.ua(tb(a)) : (b = a.u().j(), J(b instanceof T, "serverChildren would be complete if leaf node"), b = c.xc(b)), b = this.I.ta(d, b, e);
              else {
                f = O(f);
                var g = c.Xa(f, a.u());
                null == g && rb(a.u(), f) && (g = d.M(f));
                b = null != g ? this.I.G(d, f, g, b, e) : a.D.j().Ha(f) ? this.I.G(d, f, C, b, e) : d;
                b.e() && Hb(a.u()) && (d = c.ua(tb(a)), d.N() && (b = this.I.ta(b, d, e)));
              }
              d = Hb(a.u()) || null != c.sc(F);
              c = Fd(a, b, d, this.I.Ga());
            }
          else
            c = Gd(this, a, b.path, c, d, e);
        else if (b.type === $b)
          d = b.path, b = a.u(), f = b.j(), g = b.$ || d.e(), c = Hd(this, new Id(a.D, new sb(f, g, b.Tb)), d, c, pb, e);
        else
          throw Hc("Unknown operation type: " + b.type);
        e = ra(e.eb);
        d = c;
        b = d.D;
        b.$ && (f = b.j().N() || b.j().e(), g = Jd(a), (0 < e.length || !a.D.$ || f && !b.j().Z(g) || !b.j().A().Z(g.A())) && e.push(Db(Jd(d))));
        return new yd(c, e);
      };
      function Hd(a, b, c, d, e, f) {
        var g = b.D;
        if (null != d.sc(c))
          return b;
        var k;
        if (c.e())
          J(Hb(b.u()), "If change path is empty, we must have complete server data"), b.u().Tb ? (e = tb(b), d = d.xc(e instanceof T ? e : C)) : d = d.ua(tb(b)), f = a.I.ta(b.D.j(), d, f);
        else {
          var l = O(c);
          if (".priority" == l)
            J(1 == uc(c), "Can't have a priority with additional path components"), f = g.j(), k = b.u().j(), d = d.hd(c, f, k), f = null != d ? a.I.da(f, d) : g.j();
          else {
            var m = G(c);
            rb(g, l) ? (k = b.u().j(), d = d.hd(c, g.j(), k), d = null != d ? g.j().M(l).G(m, d) : g.j().M(l)) : d = d.Xa(l, b.u());
            f = null != d ? a.I.G(g.j(), l, d, e, f) : g.j();
          }
        }
        return Fd(b, f, g.$ || c.e(), a.I.Ga());
      }
      function Bd(a, b, c, d, e, f, g, k) {
        var l = b.u();
        g = g ? a.I : a.I.Vb();
        if (c.e())
          d = g.ta(l.j(), d, null);
        else if (g.Ga() && !l.Tb)
          d = l.j().G(c, d), d = g.ta(l.j(), d, null);
        else {
          var m = O(c);
          if ((c.e() ? !l.$ || l.Tb : !rb(l, O(c))) && 1 < uc(c))
            return b;
          d = l.j().M(m).G(G(c), d);
          d = ".priority" == m ? g.da(l.j(), d) : g.G(l.j(), m, d, pb, null);
        }
        l = l.$ || c.e();
        b = new Id(b.D, new sb(d, l, g.Ga()));
        return Hd(a, b, c, e, new qb(e, b, f), k);
      }
      function Ad(a, b, c, d, e, f, g) {
        var k = b.D;
        e = new qb(e, b, f);
        if (c.e())
          g = a.I.ta(b.D.j(), d, g), a = Fd(b, g, !0, a.I.Ga());
        else if (f = O(c), ".priority" === f)
          g = a.I.da(b.D.j(), d), a = Fd(b, g, k.$, k.Tb);
        else {
          var l = G(c);
          c = k.j().M(f);
          if (!l.e()) {
            var m = e.pf(f);
            d = null != m ? ".priority" === vc(l) && m.oa(l.parent()).e() ? m : m.G(l, d) : C;
          }
          c.Z(d) ? a = b : (g = a.I.G(k.j(), f, d, e, g), a = Fd(b, g, k.$, a.I.Ga()));
        }
        return a;
      }
      function Dd(a, b, c, d, e, f, g) {
        var k = b;
        Kd(d, function(d, m) {
          var v = c.w(d);
          rb(b.D, O(v)) && (k = Ad(a, k, v, m, e, f, g));
        });
        Kd(d, function(d, m) {
          var v = c.w(d);
          rb(b.D, O(v)) || (k = Ad(a, k, v, m, e, f, g));
        });
        return k;
      }
      function Ld(a, b) {
        Kd(b, function(b, d) {
          a = a.G(b, d);
        });
        return a;
      }
      function Ed(a, b, c, d, e, f, g, k) {
        if (b.u().j().e() && !Hb(b.u()))
          return b;
        var l = b;
        c = c.e() ? d : Md(Nd, c, d);
        var m = b.u().j();
        c.children.ha(function(c, d) {
          if (m.Ha(c)) {
            var I = b.u().j().M(c),
                I = Ld(I, d);
            l = Bd(a, l, new K(c), I, e, f, g, k);
          }
        });
        c.children.ha(function(c, d) {
          var I = !Hb(b.u()) && null == d.value;
          m.Ha(c) || I || (I = b.u().j().M(c), I = Ld(I, d), l = Bd(a, l, new K(c), I, e, f, g, k));
        });
        return l;
      }
      function Gd(a, b, c, d, e, f) {
        if (null != d.sc(c))
          return b;
        var g = new qb(d, b, e),
            k = e = b.D.j();
        if (Hb(b.u())) {
          if (c.e())
            e = d.ua(tb(b)), k = a.I.ta(b.D.j(), e, f);
          else if (".priority" === O(c)) {
            var l = d.Xa(O(c), b.u());
            null == l || e.e() || e.A().Z(l) || (k = a.I.da(e, l));
          } else
            l = O(c), e = d.Xa(l, b.u()), null != e && (k = a.I.G(b.D.j(), l, e, g, f));
          e = !0;
        } else if (b.D.$ || c.e())
          k = e, e = b.D.j(), e.N() || e.U(M, function(c) {
            var e = d.Xa(c, b.u());
            null != e && (k = a.I.G(k, c, e, g, f));
          }), e = b.D.$;
        else {
          l = O(c);
          if (1 == uc(c) || rb(b.D, l))
            c = d.Xa(l, b.u()), null != c && (k = a.I.G(e, l, c, g, f));
          e = !1;
        }
        return Fd(b, k, e, a.I.Ga());
      }
      ;
      function Od() {}
      var Pd = {};
      function ud(a) {
        return q(a.compare, a);
      }
      Od.prototype.xd = function(a, b) {
        return 0 !== this.compare(new E("[MIN_NAME]", a), new E("[MIN_NAME]", b));
      };
      Od.prototype.Sc = function() {
        return Qd;
      };
      function Rd(a) {
        this.bc = a;
      }
      ma(Rd, Od);
      h = Rd.prototype;
      h.Hc = function(a) {
        return !a.M(this.bc).e();
      };
      h.compare = function(a, b) {
        var c = a.S.M(this.bc),
            d = b.S.M(this.bc),
            c = c.Cc(d);
        return 0 === c ? Sb(a.name, b.name) : c;
      };
      h.Oc = function(a, b) {
        var c = L(a),
            c = C.Q(this.bc, c);
        return new E(b, c);
      };
      h.Pc = function() {
        var a = C.Q(this.bc, Sd);
        return new E("[MAX_NAME]", a);
      };
      h.toString = function() {
        return this.bc;
      };
      function Td() {}
      ma(Td, Od);
      h = Td.prototype;
      h.compare = function(a, b) {
        var c = a.S.A(),
            d = b.S.A(),
            c = c.Cc(d);
        return 0 === c ? Sb(a.name, b.name) : c;
      };
      h.Hc = function(a) {
        return !a.A().e();
      };
      h.xd = function(a, b) {
        return !a.A().Z(b.A());
      };
      h.Sc = function() {
        return Qd;
      };
      h.Pc = function() {
        return new E("[MAX_NAME]", new tc("[PRIORITY-POST]", Sd));
      };
      h.Oc = function(a, b) {
        var c = L(a);
        return new E(b, new tc("[PRIORITY-POST]", c));
      };
      h.toString = function() {
        return ".priority";
      };
      var M = new Td;
      function Ud() {}
      ma(Ud, Od);
      h = Ud.prototype;
      h.compare = function(a, b) {
        return Sb(a.name, b.name);
      };
      h.Hc = function() {
        throw Hc("KeyIndex.isDefinedOn not expected to be called.");
      };
      h.xd = function() {
        return !1;
      };
      h.Sc = function() {
        return Qd;
      };
      h.Pc = function() {
        return new E("[MAX_NAME]", C);
      };
      h.Oc = function(a) {
        J(p(a), "KeyIndex indexValue must always be a string.");
        return new E(a, C);
      };
      h.toString = function() {
        return ".key";
      };
      var Vd = new Ud;
      function Wd() {}
      ma(Wd, Od);
      h = Wd.prototype;
      h.compare = function(a, b) {
        var c = a.S.Cc(b.S);
        return 0 === c ? Sb(a.name, b.name) : c;
      };
      h.Hc = function() {
        return !0;
      };
      h.xd = function(a, b) {
        return !a.Z(b);
      };
      h.Sc = function() {
        return Qd;
      };
      h.Pc = function() {
        return Xd;
      };
      h.Oc = function(a, b) {
        var c = L(a);
        return new E(b, c);
      };
      h.toString = function() {
        return ".value";
      };
      var Yd = new Wd;
      function Zd() {
        this.Rb = this.na = this.Lb = this.la = this.ia = !1;
        this.ja = 0;
        this.Nb = "";
        this.dc = null;
        this.xb = "";
        this.ac = null;
        this.vb = "";
        this.g = M;
      }
      var $d = new Zd;
      function sd(a) {
        return "" === a.Nb ? a.la : "l" === a.Nb;
      }
      function od(a) {
        J(a.la, "Only valid if start has been set");
        return a.dc;
      }
      function nd(a) {
        J(a.la, "Only valid if start has been set");
        return a.Lb ? a.xb : "[MIN_NAME]";
      }
      function qd(a) {
        J(a.na, "Only valid if end has been set");
        return a.ac;
      }
      function pd(a) {
        J(a.na, "Only valid if end has been set");
        return a.Rb ? a.vb : "[MAX_NAME]";
      }
      function ae(a) {
        var b = new Zd;
        b.ia = a.ia;
        b.ja = a.ja;
        b.la = a.la;
        b.dc = a.dc;
        b.Lb = a.Lb;
        b.xb = a.xb;
        b.na = a.na;
        b.ac = a.ac;
        b.Rb = a.Rb;
        b.vb = a.vb;
        b.g = a.g;
        return b;
      }
      h = Zd.prototype;
      h.Ge = function(a) {
        var b = ae(this);
        b.ia = !0;
        b.ja = a;
        b.Nb = "";
        return b;
      };
      h.He = function(a) {
        var b = ae(this);
        b.ia = !0;
        b.ja = a;
        b.Nb = "l";
        return b;
      };
      h.Ie = function(a) {
        var b = ae(this);
        b.ia = !0;
        b.ja = a;
        b.Nb = "r";
        return b;
      };
      h.Xd = function(a, b) {
        var c = ae(this);
        c.la = !0;
        n(a) || (a = null);
        c.dc = a;
        null != b ? (c.Lb = !0, c.xb = b) : (c.Lb = !1, c.xb = "");
        return c;
      };
      h.qd = function(a, b) {
        var c = ae(this);
        c.na = !0;
        n(a) || (a = null);
        c.ac = a;
        n(b) ? (c.Rb = !0, c.vb = b) : (c.Yg = !1, c.vb = "");
        return c;
      };
      function be(a, b) {
        var c = ae(a);
        c.g = b;
        return c;
      }
      function ce(a) {
        var b = {};
        a.la && (b.sp = a.dc, a.Lb && (b.sn = a.xb));
        a.na && (b.ep = a.ac, a.Rb && (b.en = a.vb));
        if (a.ia) {
          b.l = a.ja;
          var c = a.Nb;
          "" === c && (c = sd(a) ? "l" : "r");
          b.vf = c;
        }
        a.g !== M && (b.i = a.g.toString());
        return b;
      }
      function de(a) {
        return !(a.la || a.na || a.ia);
      }
      function ee(a) {
        var b = {};
        if (de(a) && a.g == M)
          return b;
        var c;
        a.g === M ? c = "$priority" : a.g === Yd ? c = "$value" : (J(a.g instanceof Rd, "Unrecognized index type!"), c = a.g.toString());
        b.orderBy = B(c);
        a.la && (b.startAt = B(a.dc), a.Lb && (b.startAt += "," + B(a.xb)));
        a.na && (b.endAt = B(a.ac), a.Rb && (b.endAt += "," + B(a.vb)));
        a.ia && (sd(a) ? b.limitToFirst = a.ja : b.limitToLast = a.ja);
        return b;
      }
      h.toString = function() {
        return B(ce(this));
      };
      function fe(a, b) {
        this.yd = a;
        this.cc = b;
      }
      fe.prototype.get = function(a) {
        var b = w(this.yd, a);
        if (!b)
          throw Error("No index defined for " + a);
        return b === Pd ? null : b;
      };
      function ge(a, b, c) {
        var d = na(a.yd, function(d, f) {
          var g = w(a.cc, f);
          J(g, "Missing index implementation for " + f);
          if (d === Pd) {
            if (g.Hc(b.S)) {
              for (var k = [],
                  l = c.Wb(Qb),
                  m = H(l); m; )
                m.name != b.name && k.push(m), m = H(l);
              k.push(b);
              return he(k, ud(g));
            }
            return Pd;
          }
          g = c.get(b.name);
          k = d;
          g && (k = k.remove(new E(b.name, g)));
          return k.Na(b, b.S);
        });
        return new fe(d, a.cc);
      }
      function ie(a, b, c) {
        var d = na(a.yd, function(a) {
          if (a === Pd)
            return a;
          var d = c.get(b.name);
          return d ? a.remove(new E(b.name, d)) : a;
        });
        return new fe(d, a.cc);
      }
      var je = new fe({".priority": Pd}, {".priority": M});
      function tc(a, b) {
        this.C = a;
        J(n(this.C) && null !== this.C, "LeafNode shouldn't be created with null/undefined value.");
        this.ba = b || C;
        ke(this.ba);
        this.Bb = null;
      }
      h = tc.prototype;
      h.N = function() {
        return !0;
      };
      h.A = function() {
        return this.ba;
      };
      h.da = function(a) {
        return new tc(this.C, a);
      };
      h.M = function(a) {
        return ".priority" === a ? this.ba : C;
      };
      h.oa = function(a) {
        return a.e() ? this : ".priority" === O(a) ? this.ba : C;
      };
      h.Ha = function() {
        return !1;
      };
      h.qf = function() {
        return null;
      };
      h.Q = function(a, b) {
        return ".priority" === a ? this.da(b) : b.e() && ".priority" !== a ? this : C.Q(a, b).da(this.ba);
      };
      h.G = function(a, b) {
        var c = O(a);
        if (null === c)
          return b;
        if (b.e() && ".priority" !== c)
          return this;
        J(".priority" !== c || 1 === uc(a), ".priority must be the last token in a path");
        return this.Q(c, C.G(G(a), b));
      };
      h.e = function() {
        return !1;
      };
      h.Db = function() {
        return 0;
      };
      h.K = function(a) {
        return a && !this.A().e() ? {
          ".value": this.Ba(),
          ".priority": this.A().K()
        } : this.Ba();
      };
      h.hash = function() {
        if (null === this.Bb) {
          var a = "";
          this.ba.e() || (a += "priority:" + le(this.ba.K()) + ":");
          var b = typeof this.C,
              a = a + (b + ":"),
              a = "number" === b ? a + Zc(this.C) : a + this.C;
          this.Bb = Jc(a);
        }
        return this.Bb;
      };
      h.Ba = function() {
        return this.C;
      };
      h.Cc = function(a) {
        if (a === C)
          return 1;
        if (a instanceof T)
          return -1;
        J(a.N(), "Unknown node type");
        var b = typeof a.C,
            c = typeof this.C,
            d = Na(me, b),
            e = Na(me, c);
        J(0 <= d, "Unknown leaf type: " + b);
        J(0 <= e, "Unknown leaf type: " + c);
        return d === e ? "object" === c ? 0 : this.C < a.C ? -1 : this.C === a.C ? 0 : 1 : e - d;
      };
      var me = ["object", "boolean", "number", "string"];
      tc.prototype.mb = function() {
        return this;
      };
      tc.prototype.Ic = function() {
        return !0;
      };
      tc.prototype.Z = function(a) {
        return a === this ? !0 : a.N() ? this.C === a.C && this.ba.Z(a.ba) : !1;
      };
      tc.prototype.toString = function() {
        return B(this.K(!0));
      };
      function T(a, b, c) {
        this.m = a;
        (this.ba = b) && ke(this.ba);
        a.e() && J(!this.ba || this.ba.e(), "An empty node cannot have a priority");
        this.wb = c;
        this.Bb = null;
      }
      h = T.prototype;
      h.N = function() {
        return !1;
      };
      h.A = function() {
        return this.ba || C;
      };
      h.da = function(a) {
        return this.m.e() ? this : new T(this.m, a, this.wb);
      };
      h.M = function(a) {
        if (".priority" === a)
          return this.A();
        a = this.m.get(a);
        return null === a ? C : a;
      };
      h.oa = function(a) {
        var b = O(a);
        return null === b ? this : this.M(b).oa(G(a));
      };
      h.Ha = function(a) {
        return null !== this.m.get(a);
      };
      h.Q = function(a, b) {
        J(b, "We should always be passing snapshot nodes");
        if (".priority" === a)
          return this.da(b);
        var c = new E(a, b),
            d,
            e;
        b.e() ? (d = this.m.remove(a), c = ie(this.wb, c, this.m)) : (d = this.m.Na(a, b), c = ge(this.wb, c, this.m));
        e = d.e() ? C : this.ba;
        return new T(d, e, c);
      };
      h.G = function(a, b) {
        var c = O(a);
        if (null === c)
          return b;
        J(".priority" !== O(a) || 1 === uc(a), ".priority must be the last token in a path");
        var d = this.M(c).G(G(a), b);
        return this.Q(c, d);
      };
      h.e = function() {
        return this.m.e();
      };
      h.Db = function() {
        return this.m.count();
      };
      var ne = /^(0|[1-9]\d*)$/;
      h = T.prototype;
      h.K = function(a) {
        if (this.e())
          return null;
        var b = {},
            c = 0,
            d = 0,
            e = !0;
        this.U(M, function(f, g) {
          b[f] = g.K(a);
          c++;
          e && ne.test(f) ? d = Math.max(d, Number(f)) : e = !1;
        });
        if (!a && e && d < 2 * c) {
          var f = [],
              g;
          for (g in b)
            f[g] = b[g];
          return f;
        }
        a && !this.A().e() && (b[".priority"] = this.A().K());
        return b;
      };
      h.hash = function() {
        if (null === this.Bb) {
          var a = "";
          this.A().e() || (a += "priority:" + le(this.A().K()) + ":");
          this.U(M, function(b, c) {
            var d = c.hash();
            "" !== d && (a += ":" + b + ":" + d);
          });
          this.Bb = "" === a ? "" : Jc(a);
        }
        return this.Bb;
      };
      h.qf = function(a, b, c) {
        return (c = oe(this, c)) ? (a = cc(c, new E(a, b))) ? a.name : null : cc(this.m, a);
      };
      function wd(a, b) {
        var c;
        c = (c = oe(a, b)) ? (c = c.Rc()) && c.name : a.m.Rc();
        return c ? new E(c, a.m.get(c)) : null;
      }
      function xd(a, b) {
        var c;
        c = (c = oe(a, b)) ? (c = c.ec()) && c.name : a.m.ec();
        return c ? new E(c, a.m.get(c)) : null;
      }
      h.U = function(a, b) {
        var c = oe(this, a);
        return c ? c.ha(function(a) {
          return b(a.name, a.S);
        }) : this.m.ha(b);
      };
      h.Wb = function(a) {
        return this.Xb(a.Sc(), a);
      };
      h.Xb = function(a, b) {
        var c = oe(this, b);
        if (c)
          return c.Xb(a, function(a) {
            return a;
          });
        for (var c = this.m.Xb(a.name, Qb),
            d = ec(c); null != d && 0 > b.compare(d, a); )
          H(c), d = ec(c);
        return c;
      };
      h.rf = function(a) {
        return this.Zb(a.Pc(), a);
      };
      h.Zb = function(a, b) {
        var c = oe(this, b);
        if (c)
          return c.Zb(a, function(a) {
            return a;
          });
        for (var c = this.m.Zb(a.name, Qb),
            d = ec(c); null != d && 0 < b.compare(d, a); )
          H(c), d = ec(c);
        return c;
      };
      h.Cc = function(a) {
        return this.e() ? a.e() ? 0 : -1 : a.N() || a.e() ? 1 : a === Sd ? -1 : 0;
      };
      h.mb = function(a) {
        if (a === Vd || ta(this.wb.cc, a.toString()))
          return this;
        var b = this.wb,
            c = this.m;
        J(a !== Vd, "KeyIndex always exists and isn't meant to be added to the IndexMap.");
        for (var d = [],
            e = !1,
            c = c.Wb(Qb),
            f = H(c); f; )
          e = e || a.Hc(f.S), d.push(f), f = H(c);
        d = e ? he(d, ud(a)) : Pd;
        e = a.toString();
        c = xa(b.cc);
        c[e] = a;
        a = xa(b.yd);
        a[e] = d;
        return new T(this.m, this.ba, new fe(a, c));
      };
      h.Ic = function(a) {
        return a === Vd || ta(this.wb.cc, a.toString());
      };
      h.Z = function(a) {
        if (a === this)
          return !0;
        if (a.N())
          return !1;
        if (this.A().Z(a.A()) && this.m.count() === a.m.count()) {
          var b = this.Wb(M);
          a = a.Wb(M);
          for (var c = H(b),
              d = H(a); c && d; ) {
            if (c.name !== d.name || !c.S.Z(d.S))
              return !1;
            c = H(b);
            d = H(a);
          }
          return null === c && null === d;
        }
        return !1;
      };
      function oe(a, b) {
        return b === Vd ? null : a.wb.get(b.toString());
      }
      h.toString = function() {
        return B(this.K(!0));
      };
      function L(a, b) {
        if (null === a)
          return C;
        var c = null;
        "object" === typeof a && ".priority" in a ? c = a[".priority"] : "undefined" !== typeof b && (c = b);
        J(null === c || "string" === typeof c || "number" === typeof c || "object" === typeof c && ".sv" in c, "Invalid priority type found: " + typeof c);
        "object" === typeof a && ".value" in a && null !== a[".value"] && (a = a[".value"]);
        if ("object" !== typeof a || ".sv" in a)
          return new tc(a, L(c));
        if (a instanceof Array) {
          var d = C,
              e = a;
          r(e, function(a, b) {
            if (u(e, b) && "." !== b.substring(0, 1)) {
              var c = L(a);
              if (c.N() || !c.e())
                d = d.Q(b, c);
            }
          });
          return d.da(L(c));
        }
        var f = [],
            g = !1,
            k = a;
        hb(k, function(a) {
          if ("string" !== typeof a || "." !== a.substring(0, 1)) {
            var b = L(k[a]);
            b.e() || (g = g || !b.A().e(), f.push(new E(a, b)));
          }
        });
        if (0 == f.length)
          return C;
        var l = he(f, Rb, function(a) {
          return a.name;
        }, Tb);
        if (g) {
          var m = he(f, ud(M));
          return new T(l, L(c), new fe({".priority": m}, {".priority": M}));
        }
        return new T(l, L(c), je);
      }
      var pe = Math.log(2);
      function qe(a) {
        this.count = parseInt(Math.log(a + 1) / pe, 10);
        this.hf = this.count - 1;
        this.bg = a + 1 & parseInt(Array(this.count + 1).join("1"), 2);
      }
      function re(a) {
        var b = !(a.bg & 1 << a.hf);
        a.hf--;
        return b;
      }
      function he(a, b, c, d) {
        function e(b, d) {
          var f = d - b;
          if (0 == f)
            return null;
          if (1 == f) {
            var m = a[b],
                v = c ? c(m) : m;
            return new fc(v, m.S, !1, null, null);
          }
          var m = parseInt(f / 2, 10) + b,
              f = e(b, m),
              y = e(m + 1, d),
              m = a[m],
              v = c ? c(m) : m;
          return new fc(v, m.S, !1, f, y);
        }
        a.sort(b);
        var f = function(b) {
          function d(b, g) {
            var k = v - b,
                y = v;
            v -= b;
            var y = e(k + 1, y),
                k = a[k],
                I = c ? c(k) : k,
                y = new fc(I, k.S, g, null, y);
            f ? f.left = y : m = y;
            f = y;
          }
          for (var f = null,
              m = null,
              v = a.length,
              y = 0; y < b.count; ++y) {
            var I = re(b),
                vd = Math.pow(2, b.count - (y + 1));
            I ? d(vd, !1) : (d(vd, !1), d(vd, !0));
          }
          return m;
        }(new qe(a.length));
        return null !== f ? new ac(d || b, f) : new ac(d || b);
      }
      function le(a) {
        return "number" === typeof a ? "number:" + Zc(a) : "string:" + a;
      }
      function ke(a) {
        if (a.N()) {
          var b = a.K();
          J("string" === typeof b || "number" === typeof b || "object" === typeof b && u(b, ".sv"), "Priority must be a string or number.");
        } else
          J(a === Sd || a.e(), "priority of unexpected type.");
        J(a === Sd || a.A().e(), "Priority nodes can't have a priority of their own.");
      }
      var C = new T(new ac(Tb), null, je);
      function se() {
        T.call(this, new ac(Tb), C, je);
      }
      ma(se, T);
      h = se.prototype;
      h.Cc = function(a) {
        return a === this ? 0 : 1;
      };
      h.Z = function(a) {
        return a === this;
      };
      h.A = function() {
        return this;
      };
      h.M = function() {
        return C;
      };
      h.e = function() {
        return !1;
      };
      var Sd = new se,
          Qd = new E("[MIN_NAME]", C),
          Xd = new E("[MAX_NAME]", Sd);
      function Id(a, b) {
        this.D = a;
        this.Ud = b;
      }
      function Fd(a, b, c, d) {
        return new Id(new sb(b, c, d), a.Ud);
      }
      function Jd(a) {
        return a.D.$ ? a.D.j() : null;
      }
      Id.prototype.u = function() {
        return this.Ud;
      };
      function tb(a) {
        return a.Ud.$ ? a.Ud.j() : null;
      }
      ;
      function te(a, b) {
        this.V = a;
        var c = a.n,
            d = new ld(c.g),
            c = de(c) ? new ld(c.g) : c.ia ? new rd(c) : new md(c);
        this.Gf = new zd(c);
        var e = b.u(),
            f = b.D,
            g = d.ta(C, e.j(), null),
            k = c.ta(C, f.j(), null);
        this.Ka = new Id(new sb(k, f.$, c.Ga()), new sb(g, e.$, d.Ga()));
        this.Za = [];
        this.ig = new dd(a);
      }
      function ue(a) {
        return a.V;
      }
      h = te.prototype;
      h.u = function() {
        return this.Ka.u().j();
      };
      h.hb = function(a) {
        var b = tb(this.Ka);
        return b && (de(this.V.n) || !a.e() && !b.M(O(a)).e()) ? b.oa(a) : null;
      };
      h.e = function() {
        return 0 === this.Za.length;
      };
      h.Ob = function(a) {
        this.Za.push(a);
      };
      h.kb = function(a, b) {
        var c = [];
        if (b) {
          J(null == a, "A cancel should cancel all event registrations.");
          var d = this.V.path;
          Oa(this.Za, function(a) {
            (a = a.ff(b, d)) && c.push(a);
          });
        }
        if (a) {
          for (var e = [],
              f = 0; f < this.Za.length; ++f) {
            var g = this.Za[f];
            if (!g.matches(a))
              e.push(g);
            else if (a.sf()) {
              e = e.concat(this.Za.slice(f + 1));
              break;
            }
          }
          this.Za = e;
        } else
          this.Za = [];
        return c;
      };
      h.bb = function(a, b, c) {
        a.type === Cd && null !== a.source.Ib && (J(tb(this.Ka), "We should always have a full cache before handling merges"), J(Jd(this.Ka), "Missing event cache, even though we have a server cache"));
        var d = this.Ka;
        a = this.Gf.bb(d, a, b, c);
        b = this.Gf;
        c = a.he;
        J(c.D.j().Ic(b.I.g), "Event snap not indexed");
        J(c.u().j().Ic(b.I.g), "Server snap not indexed");
        J(Hb(a.he.u()) || !Hb(d.u()), "Once a server snap is complete, it should never go back");
        this.Ka = a.he;
        return ve(this, a.cg, a.he.D.j(), null);
      };
      function we(a, b) {
        var c = a.Ka.D,
            d = [];
        c.j().N() || c.j().U(M, function(a, b) {
          d.push(new D("child_added", b, a));
        });
        c.$ && d.push(Db(c.j()));
        return ve(a, d, c.j(), b);
      }
      function ve(a, b, c, d) {
        return ed(a.ig, b, c, d ? [d] : a.Za);
      }
      ;
      function xe(a, b, c) {
        this.type = Cd;
        this.source = a;
        this.path = b;
        this.children = c;
      }
      xe.prototype.Wc = function(a) {
        if (this.path.e())
          return a = this.children.subtree(new K(a)), a.e() ? null : a.value ? new Ub(this.source, F, a.value) : new xe(this.source, F, a);
        J(O(this.path) === a, "Can't get a merge for a child not on the path of the operation");
        return new xe(this.source, G(this.path), this.children);
      };
      xe.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " merge: " + this.children.toString() + ")";
      };
      var Vb = 0,
          Cd = 1,
          Xb = 2,
          $b = 3;
      function ye(a, b, c, d) {
        this.ve = a;
        this.of = b;
        this.Ib = c;
        this.af = d;
        J(!d || b, "Tagged queries must be from server.");
      }
      var Yb = new ye(!0, !1, null, !1),
          ze = new ye(!1, !0, null, !1);
      ye.prototype.toString = function() {
        return this.ve ? "user" : this.af ? "server(queryID=" + this.Ib + ")" : "server";
      };
      function Ae(a, b) {
        this.f = Oc("p:rest:");
        this.H = a;
        this.Gb = b;
        this.Fa = null;
        this.aa = {};
      }
      function Be(a, b) {
        if (n(b))
          return "tag$" + b;
        var c = a.n;
        J(de(c) && c.g == M, "should have a tag if it's not a default query.");
        return a.path.toString();
      }
      h = Ae.prototype;
      h.xf = function(a, b, c, d) {
        var e = a.path.toString();
        this.f("Listen called for " + e + " " + a.wa());
        var f = Be(a, c),
            g = {};
        this.aa[f] = g;
        a = ee(a.n);
        var k = this;
        Ce(this, e + ".json", a, function(a, b) {
          var v = b;
          404 === a && (a = v = null);
          null === a && k.Gb(e, v, !1, c);
          w(k.aa, f) === g && d(a ? 401 == a ? "permission_denied" : "rest_error:" + a : "ok", null);
        });
      };
      h.Of = function(a, b) {
        var c = Be(a, b);
        delete this.aa[c];
      };
      h.P = function(a, b) {
        this.Fa = a;
        var c = ad(a),
            d = c.data,
            c = c.Ac && c.Ac.exp;
        b && b("ok", {
          auth: d,
          expires: c
        });
      };
      h.ee = function(a) {
        this.Fa = null;
        a("ok", null);
      };
      h.Le = function() {};
      h.Bf = function() {};
      h.Gd = function() {};
      h.put = function() {};
      h.yf = function() {};
      h.Te = function() {};
      function Ce(a, b, c, d) {
        c = c || {};
        c.format = "export";
        a.Fa && (c.auth = a.Fa);
        var e = (a.H.lb ? "https://" : "http://") + a.H.host + b + "?" + jb(c);
        a.f("Sending REST request for " + e);
        var f = new XMLHttpRequest;
        f.onreadystatechange = function() {
          if (d && 4 === f.readyState) {
            a.f("REST Response for " + e + " received. status:", f.status, "response:", f.responseText);
            var b = null;
            if (200 <= f.status && 300 > f.status) {
              try {
                b = mb(f.responseText);
              } catch (c) {
                Q("Failed to parse JSON response for " + e + ": " + f.responseText);
              }
              d(null, b);
            } else
              401 !== f.status && 404 !== f.status && Q("Got unsuccessful REST response for " + e + " Status: " + f.status), d(f.status);
            d = null;
          }
        };
        f.open("GET", e, !0);
        f.send();
      }
      ;
      function De(a, b) {
        this.value = a;
        this.children = b || Ee;
      }
      var Ee = new ac(function(a, b) {
        return a === b ? 0 : a < b ? -1 : 1;
      });
      function Fe(a) {
        var b = Nd;
        r(a, function(a, d) {
          b = b.set(new K(d), a);
        });
        return b;
      }
      h = De.prototype;
      h.e = function() {
        return null === this.value && this.children.e();
      };
      function Ge(a, b, c) {
        if (null != a.value && c(a.value))
          return {
            path: F,
            value: a.value
          };
        if (b.e())
          return null;
        var d = O(b);
        a = a.children.get(d);
        return null !== a ? (b = Ge(a, G(b), c), null != b ? {
          path: (new K(d)).w(b.path),
          value: b.value
        } : null) : null;
      }
      function He(a, b) {
        return Ge(a, b, function() {
          return !0;
        });
      }
      h.subtree = function(a) {
        if (a.e())
          return this;
        var b = this.children.get(O(a));
        return null !== b ? b.subtree(G(a)) : Nd;
      };
      h.set = function(a, b) {
        if (a.e())
          return new De(b, this.children);
        var c = O(a),
            d = (this.children.get(c) || Nd).set(G(a), b),
            c = this.children.Na(c, d);
        return new De(this.value, c);
      };
      h.remove = function(a) {
        if (a.e())
          return this.children.e() ? Nd : new De(null, this.children);
        var b = O(a),
            c = this.children.get(b);
        return c ? (a = c.remove(G(a)), b = a.e() ? this.children.remove(b) : this.children.Na(b, a), null === this.value && b.e() ? Nd : new De(this.value, b)) : this;
      };
      h.get = function(a) {
        if (a.e())
          return this.value;
        var b = this.children.get(O(a));
        return b ? b.get(G(a)) : null;
      };
      function Md(a, b, c) {
        if (b.e())
          return c;
        var d = O(b);
        b = Md(a.children.get(d) || Nd, G(b), c);
        d = b.e() ? a.children.remove(d) : a.children.Na(d, b);
        return new De(a.value, d);
      }
      function Ie(a, b) {
        return Je(a, F, b);
      }
      function Je(a, b, c) {
        var d = {};
        a.children.ha(function(a, f) {
          d[a] = Je(f, b.w(a), c);
        });
        return c(b, a.value, d);
      }
      function Ke(a, b, c) {
        return Le(a, b, F, c);
      }
      function Le(a, b, c, d) {
        var e = a.value ? d(c, a.value) : !1;
        if (e)
          return e;
        if (b.e())
          return null;
        e = O(b);
        return (a = a.children.get(e)) ? Le(a, G(b), c.w(e), d) : null;
      }
      function Me(a, b, c) {
        var d = F;
        if (!b.e()) {
          var e = !0;
          a.value && (e = c(d, a.value));
          !0 === e && (e = O(b), (a = a.children.get(e)) && Ne(a, G(b), d.w(e), c));
        }
      }
      function Ne(a, b, c, d) {
        if (b.e())
          return a;
        a.value && d(c, a.value);
        var e = O(b);
        return (a = a.children.get(e)) ? Ne(a, G(b), c.w(e), d) : Nd;
      }
      function Kd(a, b) {
        Oe(a, F, b);
      }
      function Oe(a, b, c) {
        a.children.ha(function(a, e) {
          Oe(e, b.w(a), c);
        });
        a.value && c(b, a.value);
      }
      function Pe(a, b) {
        a.children.ha(function(a, d) {
          d.value && b(a, d.value);
        });
      }
      var Nd = new De(null);
      De.prototype.toString = function() {
        var a = {};
        Kd(this, function(b, c) {
          a[b.toString()] = c.toString();
        });
        return B(a);
      };
      function Qe(a) {
        this.W = a;
      }
      var Re = new Qe(new De(null));
      function Se(a, b, c) {
        if (b.e())
          return new Qe(new De(c));
        var d = He(a.W, b);
        if (null != d) {
          var e = d.path,
              d = d.value;
          b = N(e, b);
          d = d.G(b, c);
          return new Qe(a.W.set(e, d));
        }
        a = Md(a.W, b, new De(c));
        return new Qe(a);
      }
      function Te(a, b, c) {
        var d = a;
        hb(c, function(a, c) {
          d = Se(d, b.w(a), c);
        });
        return d;
      }
      Qe.prototype.Od = function(a) {
        if (a.e())
          return Re;
        a = Md(this.W, a, Nd);
        return new Qe(a);
      };
      function Ue(a, b) {
        var c = He(a.W, b);
        return null != c ? a.W.get(c.path).oa(N(c.path, b)) : null;
      }
      function Ve(a) {
        var b = [],
            c = a.W.value;
        null != c ? c.N() || c.U(M, function(a, c) {
          b.push(new E(a, c));
        }) : a.W.children.ha(function(a, c) {
          null != c.value && b.push(new E(a, c.value));
        });
        return b;
      }
      function We(a, b) {
        if (b.e())
          return a;
        var c = Ue(a, b);
        return null != c ? new Qe(new De(c)) : new Qe(a.W.subtree(b));
      }
      Qe.prototype.e = function() {
        return this.W.e();
      };
      Qe.prototype.apply = function(a) {
        return Xe(F, this.W, a);
      };
      function Xe(a, b, c) {
        if (null != b.value)
          return c.G(a, b.value);
        var d = null;
        b.children.ha(function(b, f) {
          ".priority" === b ? (J(null !== f.value, "Priority writes must always be leaf nodes"), d = f.value) : c = Xe(a.w(b), f, c);
        });
        c.oa(a).e() || null === d || (c = c.G(a.w(".priority"), d));
        return c;
      }
      ;
      function Ye() {
        this.T = Re;
        this.za = [];
        this.Lc = -1;
      }
      h = Ye.prototype;
      h.Od = function(a) {
        var b = Ua(this.za, function(b) {
          return b.ie === a;
        });
        J(0 <= b, "removeWrite called with nonexistent writeId.");
        var c = this.za[b];
        this.za.splice(b, 1);
        for (var d = c.visible,
            e = !1,
            f = this.za.length - 1; d && 0 <= f; ) {
          var g = this.za[f];
          g.visible && (f >= b && Ze(g, c.path) ? d = !1 : c.path.contains(g.path) && (e = !0));
          f--;
        }
        if (d) {
          if (e)
            this.T = $e(this.za, af, F), this.Lc = 0 < this.za.length ? this.za[this.za.length - 1].ie : -1;
          else if (c.Ia)
            this.T = this.T.Od(c.path);
          else {
            var k = this;
            r(c.children, function(a, b) {
              k.T = k.T.Od(c.path.w(b));
            });
          }
          return c.path;
        }
        return null;
      };
      h.ua = function(a, b, c, d) {
        if (c || d) {
          var e = We(this.T, a);
          return !d && e.e() ? b : d || null != b || null != Ue(e, F) ? (e = $e(this.za, function(b) {
            return (b.visible || d) && (!c || !(0 <= Na(c, b.ie))) && (b.path.contains(a) || a.contains(b.path));
          }, a), b = b || C, e.apply(b)) : null;
        }
        e = Ue(this.T, a);
        if (null != e)
          return e;
        e = We(this.T, a);
        return e.e() ? b : null != b || null != Ue(e, F) ? (b = b || C, e.apply(b)) : null;
      };
      h.xc = function(a, b) {
        var c = C,
            d = Ue(this.T, a);
        if (d)
          d.N() || d.U(M, function(a, b) {
            c = c.Q(a, b);
          });
        else if (b) {
          var e = We(this.T, a);
          b.U(M, function(a, b) {
            var d = We(e, new K(a)).apply(b);
            c = c.Q(a, d);
          });
          Oa(Ve(e), function(a) {
            c = c.Q(a.name, a.S);
          });
        } else
          e = We(this.T, a), Oa(Ve(e), function(a) {
            c = c.Q(a.name, a.S);
          });
        return c;
      };
      h.hd = function(a, b, c, d) {
        J(c || d, "Either existingEventSnap or existingServerSnap must exist");
        a = a.w(b);
        if (null != Ue(this.T, a))
          return null;
        a = We(this.T, a);
        return a.e() ? d.oa(b) : a.apply(d.oa(b));
      };
      h.Xa = function(a, b, c) {
        a = a.w(b);
        var d = Ue(this.T, a);
        return null != d ? d : rb(c, b) ? We(this.T, a).apply(c.j().M(b)) : null;
      };
      h.sc = function(a) {
        return Ue(this.T, a);
      };
      h.me = function(a, b, c, d, e, f) {
        var g;
        a = We(this.T, a);
        g = Ue(a, F);
        if (null == g)
          if (null != b)
            g = a.apply(b);
          else
            return [];
        g = g.mb(f);
        if (g.e() || g.N())
          return [];
        b = [];
        a = ud(f);
        e = e ? g.Zb(c, f) : g.Xb(c, f);
        for (f = H(e); f && b.length < d; )
          0 !== a(f, c) && b.push(f), f = H(e);
        return b;
      };
      function Ze(a, b) {
        return a.Ia ? a.path.contains(b) : !!ua(a.children, function(c, d) {
          return a.path.w(d).contains(b);
        });
      }
      function af(a) {
        return a.visible;
      }
      function $e(a, b, c) {
        for (var d = Re,
            e = 0; e < a.length; ++e) {
          var f = a[e];
          if (b(f)) {
            var g = f.path;
            if (f.Ia)
              c.contains(g) ? (g = N(c, g), d = Se(d, g, f.Ia)) : g.contains(c) && (g = N(g, c), d = Se(d, F, f.Ia.oa(g)));
            else if (f.children)
              if (c.contains(g))
                g = N(c, g), d = Te(d, g, f.children);
              else {
                if (g.contains(c))
                  if (g = N(g, c), g.e())
                    d = Te(d, F, f.children);
                  else if (f = w(f.children, O(g)))
                    f = f.oa(G(g)), d = Se(d, F, f);
              }
            else
              throw Hc("WriteRecord should have .snap or .children");
          }
        }
        return d;
      }
      function bf(a, b) {
        this.Mb = a;
        this.W = b;
      }
      h = bf.prototype;
      h.ua = function(a, b, c) {
        return this.W.ua(this.Mb, a, b, c);
      };
      h.xc = function(a) {
        return this.W.xc(this.Mb, a);
      };
      h.hd = function(a, b, c) {
        return this.W.hd(this.Mb, a, b, c);
      };
      h.sc = function(a) {
        return this.W.sc(this.Mb.w(a));
      };
      h.me = function(a, b, c, d, e) {
        return this.W.me(this.Mb, a, b, c, d, e);
      };
      h.Xa = function(a, b) {
        return this.W.Xa(this.Mb, a, b);
      };
      h.w = function(a) {
        return new bf(this.Mb.w(a), this.W);
      };
      function cf() {
        this.ya = {};
      }
      h = cf.prototype;
      h.e = function() {
        return wa(this.ya);
      };
      h.bb = function(a, b, c) {
        var d = a.source.Ib;
        if (null !== d)
          return d = w(this.ya, d), J(null != d, "SyncTree gave us an op for an invalid query."), d.bb(a, b, c);
        var e = [];
        r(this.ya, function(d) {
          e = e.concat(d.bb(a, b, c));
        });
        return e;
      };
      h.Ob = function(a, b, c, d, e) {
        var f = a.wa(),
            g = w(this.ya, f);
        if (!g) {
          var g = c.ua(e ? d : null),
              k = !1;
          g ? k = !0 : (g = d instanceof T ? c.xc(d) : C, k = !1);
          g = new te(a, new Id(new sb(g, k, !1), new sb(d, e, !1)));
          this.ya[f] = g;
        }
        g.Ob(b);
        return we(g, b);
      };
      h.kb = function(a, b, c) {
        var d = a.wa(),
            e = [],
            f = [],
            g = null != df(this);
        if ("default" === d) {
          var k = this;
          r(this.ya, function(a, d) {
            f = f.concat(a.kb(b, c));
            a.e() && (delete k.ya[d], de(a.V.n) || e.push(a.V));
          });
        } else {
          var l = w(this.ya, d);
          l && (f = f.concat(l.kb(b, c)), l.e() && (delete this.ya[d], de(l.V.n) || e.push(l.V)));
        }
        g && null == df(this) && e.push(new U(a.k, a.path));
        return {
          Hg: e,
          jg: f
        };
      };
      function ef(a) {
        return Pa(ra(a.ya), function(a) {
          return !de(a.V.n);
        });
      }
      h.hb = function(a) {
        var b = null;
        r(this.ya, function(c) {
          b = b || c.hb(a);
        });
        return b;
      };
      function ff(a, b) {
        if (de(b.n))
          return df(a);
        var c = b.wa();
        return w(a.ya, c);
      }
      function df(a) {
        return va(a.ya, function(a) {
          return de(a.V.n);
        }) || null;
      }
      ;
      function gf(a) {
        this.sa = Nd;
        this.Hb = new Ye;
        this.$e = {};
        this.kc = {};
        this.Mc = a;
      }
      function hf(a, b, c, d, e) {
        var f = a.Hb,
            g = e;
        J(d > f.Lc, "Stacking an older write on top of newer ones");
        n(g) || (g = !0);
        f.za.push({
          path: b,
          Ia: c,
          ie: d,
          visible: g
        });
        g && (f.T = Se(f.T, b, c));
        f.Lc = d;
        return e ? jf(a, new Ub(Yb, b, c)) : [];
      }
      function kf(a, b, c, d) {
        var e = a.Hb;
        J(d > e.Lc, "Stacking an older merge on top of newer ones");
        e.za.push({
          path: b,
          children: c,
          ie: d,
          visible: !0
        });
        e.T = Te(e.T, b, c);
        e.Lc = d;
        c = Fe(c);
        return jf(a, new xe(Yb, b, c));
      }
      function lf(a, b, c) {
        c = c || !1;
        b = a.Hb.Od(b);
        return null == b ? [] : jf(a, new Wb(b, c));
      }
      function mf(a, b, c) {
        c = Fe(c);
        return jf(a, new xe(ze, b, c));
      }
      function nf(a, b, c, d) {
        d = of(a, d);
        if (null != d) {
          var e = pf(d);
          d = e.path;
          e = e.Ib;
          b = N(d, b);
          c = new Ub(new ye(!1, !0, e, !0), b, c);
          return qf(a, d, c);
        }
        return [];
      }
      function rf(a, b, c, d) {
        if (d = of(a, d)) {
          var e = pf(d);
          d = e.path;
          e = e.Ib;
          b = N(d, b);
          c = Fe(c);
          c = new xe(new ye(!1, !0, e, !0), b, c);
          return qf(a, d, c);
        }
        return [];
      }
      gf.prototype.Ob = function(a, b) {
        var c = a.path,
            d = null,
            e = !1;
        Me(this.sa, c, function(a, b) {
          var f = N(a, c);
          d = b.hb(f);
          e = e || null != df(b);
          return !d;
        });
        var f = this.sa.get(c);
        f ? (e = e || null != df(f), d = d || f.hb(F)) : (f = new cf, this.sa = this.sa.set(c, f));
        var g;
        null != d ? g = !0 : (g = !1, d = C, Pe(this.sa.subtree(c), function(a, b) {
          var c = b.hb(F);
          c && (d = d.Q(a, c));
        }));
        var k = null != ff(f, a);
        if (!k && !de(a.n)) {
          var l = sf(a);
          J(!(l in this.kc), "View does not exist, but we have a tag");
          var m = tf++;
          this.kc[l] = m;
          this.$e["_" + m] = l;
        }
        g = f.Ob(a, b, new bf(c, this.Hb), d, g);
        k || e || (f = ff(f, a), g = g.concat(uf(this, a, f)));
        return g;
      };
      gf.prototype.kb = function(a, b, c) {
        var d = a.path,
            e = this.sa.get(d),
            f = [];
        if (e && ("default" === a.wa() || null != ff(e, a))) {
          f = e.kb(a, b, c);
          e.e() && (this.sa = this.sa.remove(d));
          e = f.Hg;
          f = f.jg;
          b = -1 !== Ua(e, function(a) {
            return de(a.n);
          });
          var g = Ke(this.sa, d, function(a, b) {
            return null != df(b);
          });
          if (b && !g && (d = this.sa.subtree(d), !d.e()))
            for (var d = vf(d),
                k = 0; k < d.length; ++k) {
              var l = d[k],
                  m = l.V,
                  l = wf(this, l);
              this.Mc.Xe(m, xf(this, m), l.ud, l.J);
            }
          if (!g && 0 < e.length && !c)
            if (b)
              this.Mc.Zd(a, null);
            else {
              var v = this;
              Oa(e, function(a) {
                a.wa();
                var b = v.kc[sf(a)];
                v.Mc.Zd(a, b);
              });
            }
          yf(this, e);
        }
        return f;
      };
      gf.prototype.ua = function(a, b) {
        var c = this.Hb,
            d = Ke(this.sa, a, function(b, c) {
              var d = N(b, a);
              if (d = c.hb(d))
                return d;
            });
        return c.ua(a, d, b, !0);
      };
      function vf(a) {
        return Ie(a, function(a, c, d) {
          if (c && null != df(c))
            return [df(c)];
          var e = [];
          c && (e = ef(c));
          r(d, function(a) {
            e = e.concat(a);
          });
          return e;
        });
      }
      function yf(a, b) {
        for (var c = 0; c < b.length; ++c) {
          var d = b[c];
          if (!de(d.n)) {
            var d = sf(d),
                e = a.kc[d];
            delete a.kc[d];
            delete a.$e["_" + e];
          }
        }
      }
      function uf(a, b, c) {
        var d = b.path,
            e = xf(a, b);
        c = wf(a, c);
        b = a.Mc.Xe(b, e, c.ud, c.J);
        d = a.sa.subtree(d);
        if (e)
          J(null == df(d.value), "If we're adding a query, it shouldn't be shadowed");
        else
          for (e = Ie(d, function(a, b, c) {
            if (!a.e() && b && null != df(b))
              return [ue(df(b))];
            var d = [];
            b && (d = d.concat(Qa(ef(b), function(a) {
              return a.V;
            })));
            r(c, function(a) {
              d = d.concat(a);
            });
            return d;
          }), d = 0; d < e.length; ++d)
            c = e[d], a.Mc.Zd(c, xf(a, c));
        return b;
      }
      function wf(a, b) {
        var c = b.V,
            d = xf(a, c);
        return {
          ud: function() {
            return (b.u() || C).hash();
          },
          J: function(b) {
            if ("ok" === b) {
              if (d) {
                var f = c.path;
                if (b = of(a, d)) {
                  var g = pf(b);
                  b = g.path;
                  g = g.Ib;
                  f = N(b, f);
                  f = new Zb(new ye(!1, !0, g, !0), f);
                  b = qf(a, b, f);
                } else
                  b = [];
              } else
                b = jf(a, new Zb(ze, c.path));
              return b;
            }
            f = "Unknown Error";
            "too_big" === b ? f = "The data requested exceeds the maximum size that can be accessed with a single request." : "permission_denied" == b ? f = "Client doesn't have permission to access the desired data." : "unavailable" == b && (f = "The service is unavailable");
            f = Error(b + ": " + f);
            f.code = b.toUpperCase();
            return a.kb(c, null, f);
          }
        };
      }
      function sf(a) {
        return a.path.toString() + "$" + a.wa();
      }
      function pf(a) {
        var b = a.indexOf("$");
        J(-1 !== b && b < a.length - 1, "Bad queryKey.");
        return {
          Ib: a.substr(b + 1),
          path: new K(a.substr(0, b))
        };
      }
      function of(a, b) {
        var c = a.$e,
            d = "_" + b;
        return d in c ? c[d] : void 0;
      }
      function xf(a, b) {
        var c = sf(b);
        return w(a.kc, c);
      }
      var tf = 1;
      function qf(a, b, c) {
        var d = a.sa.get(b);
        J(d, "Missing sync point for query tag that we're tracking");
        return d.bb(c, new bf(b, a.Hb), null);
      }
      function jf(a, b) {
        return zf(a, b, a.sa, null, new bf(F, a.Hb));
      }
      function zf(a, b, c, d, e) {
        if (b.path.e())
          return Af(a, b, c, d, e);
        var f = c.get(F);
        null == d && null != f && (d = f.hb(F));
        var g = [],
            k = O(b.path),
            l = b.Wc(k);
        if ((c = c.children.get(k)) && l)
          var m = d ? d.M(k) : null,
              k = e.w(k),
              g = g.concat(zf(a, l, c, m, k));
        f && (g = g.concat(f.bb(b, e, d)));
        return g;
      }
      function Af(a, b, c, d, e) {
        var f = c.get(F);
        null == d && null != f && (d = f.hb(F));
        var g = [];
        c.children.ha(function(c, f) {
          var m = d ? d.M(c) : null,
              v = e.w(c),
              y = b.Wc(c);
          y && (g = g.concat(Af(a, y, f, m, v)));
        });
        f && (g = g.concat(f.bb(b, e, d)));
        return g;
      }
      ;
      function Bf() {
        this.children = {};
        this.kd = 0;
        this.value = null;
      }
      function Cf(a, b, c) {
        this.Dd = a ? a : "";
        this.Yc = b ? b : null;
        this.B = c ? c : new Bf;
      }
      function Df(a, b) {
        for (var c = b instanceof K ? b : new K(b),
            d = a,
            e; null !== (e = O(c)); )
          d = new Cf(e, d, w(d.B.children, e) || new Bf), c = G(c);
        return d;
      }
      h = Cf.prototype;
      h.Ba = function() {
        return this.B.value;
      };
      function Ef(a, b) {
        J("undefined" !== typeof b, "Cannot set value to undefined");
        a.B.value = b;
        Ff(a);
      }
      h.clear = function() {
        this.B.value = null;
        this.B.children = {};
        this.B.kd = 0;
        Ff(this);
      };
      h.td = function() {
        return 0 < this.B.kd;
      };
      h.e = function() {
        return null === this.Ba() && !this.td();
      };
      h.U = function(a) {
        var b = this;
        r(this.B.children, function(c, d) {
          a(new Cf(d, b, c));
        });
      };
      function Gf(a, b, c, d) {
        c && !d && b(a);
        a.U(function(a) {
          Gf(a, b, !0, d);
        });
        c && d && b(a);
      }
      function Hf(a, b) {
        for (var c = a.parent(); null !== c && !b(c); )
          c = c.parent();
      }
      h.path = function() {
        return new K(null === this.Yc ? this.Dd : this.Yc.path() + "/" + this.Dd);
      };
      h.name = function() {
        return this.Dd;
      };
      h.parent = function() {
        return this.Yc;
      };
      function Ff(a) {
        if (null !== a.Yc) {
          var b = a.Yc,
              c = a.Dd,
              d = a.e(),
              e = u(b.B.children, c);
          d && e ? (delete b.B.children[c], b.B.kd--, Ff(b)) : d || e || (b.B.children[c] = a.B, b.B.kd++, Ff(b));
        }
      }
      ;
      function If(a) {
        J(ea(a) && 0 < a.length, "Requires a non-empty array");
        this.Uf = a;
        this.Nc = {};
      }
      If.prototype.de = function(a, b) {
        for (var c = this.Nc[a] || [],
            d = 0; d < c.length; d++)
          c[d].yc.apply(c[d].Ma, Array.prototype.slice.call(arguments, 1));
      };
      If.prototype.Eb = function(a, b, c) {
        Jf(this, a);
        this.Nc[a] = this.Nc[a] || [];
        this.Nc[a].push({
          yc: b,
          Ma: c
        });
        (a = this.ze(a)) && b.apply(c, a);
      };
      If.prototype.gc = function(a, b, c) {
        Jf(this, a);
        a = this.Nc[a] || [];
        for (var d = 0; d < a.length; d++)
          if (a[d].yc === b && (!c || c === a[d].Ma)) {
            a.splice(d, 1);
            break;
          }
      };
      function Jf(a, b) {
        J(Ta(a.Uf, function(a) {
          return a === b;
        }), "Unknown event: " + b);
      }
      ;
      var Kf = function() {
        var a = 0,
            b = [];
        return function(c) {
          var d = c === a;
          a = c;
          for (var e = Array(8),
              f = 7; 0 <= f; f--)
            e[f] = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(c % 64), c = Math.floor(c / 64);
          J(0 === c, "Cannot push at time == 0");
          c = e.join("");
          if (d) {
            for (f = 11; 0 <= f && 63 === b[f]; f--)
              b[f] = 0;
            b[f]++;
          } else
            for (f = 0; 12 > f; f++)
              b[f] = Math.floor(64 * Math.random());
          for (f = 0; 12 > f; f++)
            c += "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(b[f]);
          J(20 === c.length, "nextPushId: Length should be 20.");
          return c;
        };
      }();
      function Lf() {
        If.call(this, ["online"]);
        this.ic = !0;
        if ("undefined" !== typeof window && "undefined" !== typeof window.addEventListener) {
          var a = this;
          window.addEventListener("online", function() {
            a.ic || (a.ic = !0, a.de("online", !0));
          }, !1);
          window.addEventListener("offline", function() {
            a.ic && (a.ic = !1, a.de("online", !1));
          }, !1);
        }
      }
      ma(Lf, If);
      Lf.prototype.ze = function(a) {
        J("online" === a, "Unknown event type: " + a);
        return [this.ic];
      };
      ca(Lf);
      function Mf() {
        If.call(this, ["visible"]);
        var a,
            b;
        "undefined" !== typeof document && "undefined" !== typeof document.addEventListener && ("undefined" !== typeof document.hidden ? (b = "visibilitychange", a = "hidden") : "undefined" !== typeof document.mozHidden ? (b = "mozvisibilitychange", a = "mozHidden") : "undefined" !== typeof document.msHidden ? (b = "msvisibilitychange", a = "msHidden") : "undefined" !== typeof document.webkitHidden && (b = "webkitvisibilitychange", a = "webkitHidden"));
        this.uc = !0;
        if (b) {
          var c = this;
          document.addEventListener(b, function() {
            var b = !document[a];
            b !== c.uc && (c.uc = b, c.de("visible", b));
          }, !1);
        }
      }
      ma(Mf, If);
      Mf.prototype.ze = function(a) {
        J("visible" === a, "Unknown event type: " + a);
        return [this.uc];
      };
      ca(Mf);
      var Nf = /[\[\].#$\/\u0000-\u001F\u007F]/,
          Of = /[\[\].#$\u0000-\u001F\u007F]/;
      function Pf(a) {
        return p(a) && 0 !== a.length && !Nf.test(a);
      }
      function Qf(a) {
        return null === a || p(a) || ga(a) && !Sc(a) || ia(a) && u(a, ".sv");
      }
      function Rf(a, b, c, d) {
        d && !n(b) || Sf(z(a, 1, d), b, c);
      }
      function Sf(a, b, c) {
        c instanceof K && (c = new wc(c, a));
        if (!n(b))
          throw Error(a + "contains undefined " + zc(c));
        if (ha(b))
          throw Error(a + "contains a function " + zc(c) + " with contents: " + b.toString());
        if (Sc(b))
          throw Error(a + "contains " + b.toString() + " " + zc(c));
        if (p(b) && b.length > 10485760 / 3 && 10485760 < xc(b))
          throw Error(a + "contains a string greater than 10485760 utf8 bytes " + zc(c) + " ('" + b.substring(0, 50) + "...')");
        if (ia(b)) {
          var d = !1,
              e = !1;
          hb(b, function(b, g) {
            if (".value" === b)
              d = !0;
            else if (".priority" !== b && ".sv" !== b && (e = !0, !Pf(b)))
              throw Error(a + " contains an invalid key (" + b + ") " + zc(c) + '.  Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"');
            c.push(b);
            Sf(a, g, c);
            c.pop();
          });
          if (d && e)
            throw Error(a + ' contains ".value" child ' + zc(c) + " in addition to actual children.");
        }
      }
      function Tf(a, b, c) {
        if (!ia(b) || ea(b))
          throw Error(z(a, 1, !1) + " must be an Object containing the children to replace.");
        if (u(b, ".value"))
          throw Error(z(a, 1, !1) + ' must not contain ".value".  To overwrite with a leaf value, just use .set() instead.');
        Rf(a, b, c, !1);
      }
      function Uf(a, b, c) {
        if (Sc(c))
          throw Error(z(a, b, !1) + "is " + c.toString() + ", but must be a valid Firebase priority (a string, finite number, server value, or null).");
        if (!Qf(c))
          throw Error(z(a, b, !1) + "must be a valid Firebase priority (a string, finite number, server value, or null).");
      }
      function Vf(a, b, c) {
        if (!c || n(b))
          switch (b) {
            case "value":
            case "child_added":
            case "child_removed":
            case "child_changed":
            case "child_moved":
              break;
            default:
              throw Error(z(a, 1, c) + 'must be a valid event type: "value", "child_added", "child_removed", "child_changed", or "child_moved".');
          }
      }
      function Wf(a, b, c, d) {
        if ((!d || n(c)) && !Pf(c))
          throw Error(z(a, b, d) + 'was an invalid key: "' + c + '".  Firebase keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]").');
      }
      function Xf(a, b) {
        if (!p(b) || 0 === b.length || Of.test(b))
          throw Error(z(a, 1, !1) + 'was an invalid path: "' + b + '". Paths must be non-empty strings and can\'t contain ".", "#", "$", "[", or "]"');
      }
      function Yf(a, b) {
        if (".info" === O(b))
          throw Error(a + " failed: Can't modify data under /.info/");
      }
      function Zf(a, b) {
        if (!p(b))
          throw Error(z(a, 1, !1) + "must be a valid credential (a string).");
      }
      function $f(a, b, c) {
        if (!p(c))
          throw Error(z(a, b, !1) + "must be a valid string.");
      }
      function ag(a, b, c, d) {
        if (!d || n(c))
          if (!ia(c) || null === c)
            throw Error(z(a, b, d) + "must be a valid object.");
      }
      function bg(a, b, c) {
        if (!ia(b) || null === b || !u(b, c))
          throw Error(z(a, 1, !1) + 'must contain the key "' + c + '"');
        if (!p(w(b, c)))
          throw Error(z(a, 1, !1) + 'must contain the key "' + c + '" with type "string"');
      }
      ;
      function cg() {
        this.set = {};
      }
      h = cg.prototype;
      h.add = function(a, b) {
        this.set[a] = null !== b ? b : !0;
      };
      h.contains = function(a) {
        return u(this.set, a);
      };
      h.get = function(a) {
        return this.contains(a) ? this.set[a] : void 0;
      };
      h.remove = function(a) {
        delete this.set[a];
      };
      h.clear = function() {
        this.set = {};
      };
      h.e = function() {
        return wa(this.set);
      };
      h.count = function() {
        return pa(this.set);
      };
      function dg(a, b) {
        r(a.set, function(a, d) {
          b(d, a);
        });
      }
      h.keys = function() {
        var a = [];
        r(this.set, function(b, c) {
          a.push(c);
        });
        return a;
      };
      function qc() {
        this.m = this.C = null;
      }
      qc.prototype.find = function(a) {
        if (null != this.C)
          return this.C.oa(a);
        if (a.e() || null == this.m)
          return null;
        var b = O(a);
        a = G(a);
        return this.m.contains(b) ? this.m.get(b).find(a) : null;
      };
      qc.prototype.mc = function(a, b) {
        if (a.e())
          this.C = b, this.m = null;
        else if (null !== this.C)
          this.C = this.C.G(a, b);
        else {
          null == this.m && (this.m = new cg);
          var c = O(a);
          this.m.contains(c) || this.m.add(c, new qc);
          c = this.m.get(c);
          a = G(a);
          c.mc(a, b);
        }
      };
      function eg(a, b) {
        if (b.e())
          return a.C = null, a.m = null, !0;
        if (null !== a.C) {
          if (a.C.N())
            return !1;
          var c = a.C;
          a.C = null;
          c.U(M, function(b, c) {
            a.mc(new K(b), c);
          });
          return eg(a, b);
        }
        return null !== a.m ? (c = O(b), b = G(b), a.m.contains(c) && eg(a.m.get(c), b) && a.m.remove(c), a.m.e() ? (a.m = null, !0) : !1) : !0;
      }
      function rc(a, b, c) {
        null !== a.C ? c(b, a.C) : a.U(function(a, e) {
          var f = new K(b.toString() + "/" + a);
          rc(e, f, c);
        });
      }
      qc.prototype.U = function(a) {
        null !== this.m && dg(this.m, function(b, c) {
          a(b, c);
        });
      };
      var fg = "auth.firebase.com";
      function gg(a, b, c) {
        this.ld = a || {};
        this.ce = b || {};
        this.ab = c || {};
        this.ld.remember || (this.ld.remember = "default");
      }
      var hg = ["remember", "redirectTo"];
      function ig(a) {
        var b = {},
            c = {};
        hb(a || {}, function(a, e) {
          0 <= Na(hg, a) ? b[a] = e : c[a] = e;
        });
        return new gg(b, {}, c);
      }
      ;
      function jg(a, b) {
        this.Pe = ["session", a.Ld, a.Cb].join(":");
        this.$d = b;
      }
      jg.prototype.set = function(a, b) {
        if (!b)
          if (this.$d.length)
            b = this.$d[0];
          else
            throw Error("fb.login.SessionManager : No storage options available!");
        b.set(this.Pe, a);
      };
      jg.prototype.get = function() {
        var a = Qa(this.$d, q(this.ng, this)),
            a = Pa(a, function(a) {
              return null !== a;
            });
        Xa(a, function(a, c) {
          return bd(c.token) - bd(a.token);
        });
        return 0 < a.length ? a.shift() : null;
      };
      jg.prototype.ng = function(a) {
        try {
          var b = a.get(this.Pe);
          if (b && b.token)
            return b;
        } catch (c) {}
        return null;
      };
      jg.prototype.clear = function() {
        var a = this;
        Oa(this.$d, function(b) {
          b.remove(a.Pe);
        });
      };
      function kg() {
        return "undefined" !== typeof window && !!(window.cordova || window.phonegap || window.PhoneGap) && /ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(navigator.userAgent);
      }
      function lg() {
        return "undefined" !== typeof location && /^file:\//.test(location.href);
      }
      function mg() {
        if ("undefined" === typeof navigator)
          return !1;
        var a = navigator.userAgent;
        if ("Microsoft Internet Explorer" === navigator.appName) {
          if ((a = a.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/)) && 1 < a.length)
            return 8 <= parseFloat(a[1]);
        } else if (-1 < a.indexOf("Trident") && (a = a.match(/rv:([0-9]{2,2}[\.0-9]{0,})/)) && 1 < a.length)
          return 8 <= parseFloat(a[1]);
        return !1;
      }
      ;
      function ng() {
        var a = window.opener.frames,
            b;
        for (b = a.length - 1; 0 <= b; b--)
          try {
            if (a[b].location.protocol === window.location.protocol && a[b].location.host === window.location.host && "__winchan_relay_frame" === a[b].name)
              return a[b];
          } catch (c) {}
        return null;
      }
      function og(a, b, c) {
        a.attachEvent ? a.attachEvent("on" + b, c) : a.addEventListener && a.addEventListener(b, c, !1);
      }
      function pg(a, b, c) {
        a.detachEvent ? a.detachEvent("on" + b, c) : a.removeEventListener && a.removeEventListener(b, c, !1);
      }
      function qg(a) {
        /^https?:\/\//.test(a) || (a = window.location.href);
        var b = /^(https?:\/\/[\-_a-zA-Z\.0-9:]+)/.exec(a);
        return b ? b[1] : a;
      }
      function rg(a) {
        var b = "";
        try {
          a = a.replace("#", "");
          var c = kb(a);
          c && u(c, "__firebase_request_key") && (b = w(c, "__firebase_request_key"));
        } catch (d) {}
        return b;
      }
      function sg() {
        var a = Rc(fg);
        return a.scheme + "://" + a.host + "/v2";
      }
      function tg(a) {
        return sg() + "/" + a + "/auth/channel";
      }
      ;
      function ug(a) {
        var b = this;
        this.zc = a;
        this.ae = "*";
        mg() ? this.Qc = this.wd = ng() : (this.Qc = window.opener, this.wd = window);
        if (!b.Qc)
          throw "Unable to find relay frame";
        og(this.wd, "message", q(this.hc, this));
        og(this.wd, "message", q(this.Af, this));
        try {
          vg(this, {a: "ready"});
        } catch (c) {
          og(this.Qc, "load", function() {
            vg(b, {a: "ready"});
          });
        }
        og(window, "unload", q(this.yg, this));
      }
      function vg(a, b) {
        b = B(b);
        mg() ? a.Qc.doPost(b, a.ae) : a.Qc.postMessage(b, a.ae);
      }
      ug.prototype.hc = function(a) {
        var b = this,
            c;
        try {
          c = mb(a.data);
        } catch (d) {}
        c && "request" === c.a && (pg(window, "message", this.hc), this.ae = a.origin, this.zc && setTimeout(function() {
          b.zc(b.ae, c.d, function(a, c) {
            b.ag = !c;
            b.zc = void 0;
            vg(b, {
              a: "response",
              d: a,
              forceKeepWindowOpen: c
            });
          });
        }, 0));
      };
      ug.prototype.yg = function() {
        try {
          pg(this.wd, "message", this.Af);
        } catch (a) {}
        this.zc && (vg(this, {
          a: "error",
          d: "unknown closed window"
        }), this.zc = void 0);
        try {
          window.close();
        } catch (b) {}
      };
      ug.prototype.Af = function(a) {
        if (this.ag && "die" === a.data)
          try {
            window.close();
          } catch (b) {}
      };
      function wg(a) {
        this.oc = Ga() + Ga() + Ga();
        this.Df = a;
      }
      wg.prototype.open = function(a, b) {
        P.set("redirect_request_id", this.oc);
        P.set("redirect_request_id", this.oc);
        b.requestId = this.oc;
        b.redirectTo = b.redirectTo || window.location.href;
        a += (/\?/.test(a) ? "" : "?") + jb(b);
        window.location = a;
      };
      wg.isAvailable = function() {
        return !lg() && !kg();
      };
      wg.prototype.Bc = function() {
        return "redirect";
      };
      var xg = {
        NETWORK_ERROR: "Unable to contact the Firebase server.",
        SERVER_ERROR: "An unknown server error occurred.",
        TRANSPORT_UNAVAILABLE: "There are no login transports available for the requested method.",
        REQUEST_INTERRUPTED: "The browser redirected the page before the login request could complete.",
        USER_CANCELLED: "The user cancelled authentication."
      };
      function yg(a) {
        var b = Error(w(xg, a), a);
        b.code = a;
        return b;
      }
      ;
      function zg(a) {
        if (!a.window_features || "undefined" !== typeof navigator && (-1 !== navigator.userAgent.indexOf("Fennec/") || -1 !== navigator.userAgent.indexOf("Firefox/") && -1 !== navigator.userAgent.indexOf("Android")))
          a.window_features = void 0;
        a.window_name || (a.window_name = "_blank");
        this.options = a;
      }
      zg.prototype.open = function(a, b, c) {
        function d(a) {
          g && (document.body.removeChild(g), g = void 0);
          v && (v = clearInterval(v));
          pg(window, "message", e);
          pg(window, "unload", d);
          if (m && !a)
            try {
              m.close();
            } catch (b) {
              k.postMessage("die", l);
            }
          m = k = void 0;
        }
        function e(a) {
          if (a.origin === l)
            try {
              var b = mb(a.data);
              "ready" === b.a ? k.postMessage(y, l) : "error" === b.a ? (d(!1), c && (c(b.d), c = null)) : "response" === b.a && (d(b.forceKeepWindowOpen), c && (c(null, b.d), c = null));
            } catch (e) {}
        }
        var f = mg(),
            g,
            k;
        if (!this.options.relay_url)
          return c(Error("invalid arguments: origin of url and relay_url must match"));
        var l = qg(a);
        if (l !== qg(this.options.relay_url))
          c && setTimeout(function() {
            c(Error("invalid arguments: origin of url and relay_url must match"));
          }, 0);
        else {
          f && (g = document.createElement("iframe"), g.setAttribute("src", this.options.relay_url), g.style.display = "none", g.setAttribute("name", "__winchan_relay_frame"), document.body.appendChild(g), k = g.contentWindow);
          a += (/\?/.test(a) ? "" : "?") + jb(b);
          var m = window.open(a, this.options.window_name, this.options.window_features);
          k || (k = m);
          var v = setInterval(function() {
            m && m.closed && (d(!1), c && (c(yg("USER_CANCELLED")), c = null));
          }, 500),
              y = B({
                a: "request",
                d: b
              });
          og(window, "unload", d);
          og(window, "message", e);
        }
      };
      zg.isAvailable = function() {
        return "postMessage" in window && !lg() && !(kg() || "undefined" !== typeof navigator && (navigator.userAgent.match(/Windows Phone/) || window.Windows && /^ms-appx:/.test(location.href)) || "undefined" !== typeof navigator && "undefined" !== typeof window && (navigator.userAgent.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i) || navigator.userAgent.match(/CriOS/) || navigator.userAgent.match(/Twitter for iPhone/) || navigator.userAgent.match(/FBAN\/FBIOS/) || window.navigator.standalone)) && !("undefined" !== typeof navigator && navigator.userAgent.match(/PhantomJS/));
      };
      zg.prototype.Bc = function() {
        return "popup";
      };
      function Ag(a) {
        a.method || (a.method = "GET");
        a.headers || (a.headers = {});
        a.headers.content_type || (a.headers.content_type = "application/json");
        a.headers.content_type = a.headers.content_type.toLowerCase();
        this.options = a;
      }
      Ag.prototype.open = function(a, b, c) {
        function d() {
          c && (c(yg("REQUEST_INTERRUPTED")), c = null);
        }
        var e = new XMLHttpRequest,
            f = this.options.method.toUpperCase(),
            g;
        og(window, "beforeunload", d);
        e.onreadystatechange = function() {
          if (c && 4 === e.readyState) {
            var a;
            if (200 <= e.status && 300 > e.status) {
              try {
                a = mb(e.responseText);
              } catch (b) {}
              c(null, a);
            } else
              500 <= e.status && 600 > e.status ? c(yg("SERVER_ERROR")) : c(yg("NETWORK_ERROR"));
            c = null;
            pg(window, "beforeunload", d);
          }
        };
        if ("GET" === f)
          a += (/\?/.test(a) ? "" : "?") + jb(b), g = null;
        else {
          var k = this.options.headers.content_type;
          "application/json" === k && (g = B(b));
          "application/x-www-form-urlencoded" === k && (g = jb(b));
        }
        e.open(f, a, !0);
        a = {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json;text/plain"
        };
        za(a, this.options.headers);
        for (var l in a)
          e.setRequestHeader(l, a[l]);
        e.send(g);
      };
      Ag.isAvailable = function() {
        return !!window.XMLHttpRequest && "string" === typeof(new XMLHttpRequest).responseType && (!("undefined" !== typeof navigator && (navigator.userAgent.match(/MSIE/) || navigator.userAgent.match(/Trident/))) || mg());
      };
      Ag.prototype.Bc = function() {
        return "json";
      };
      function Bg(a) {
        this.oc = Ga() + Ga() + Ga();
        this.Df = a;
      }
      Bg.prototype.open = function(a, b, c) {
        function d() {
          c && (c(yg("USER_CANCELLED")), c = null);
        }
        var e = this,
            f = Rc(fg),
            g;
        b.requestId = this.oc;
        b.redirectTo = f.scheme + "://" + f.host + "/blank/page.html";
        a += /\?/.test(a) ? "" : "?";
        a += jb(b);
        (g = window.open(a, "_blank", "location=no")) && ha(g.addEventListener) ? (g.addEventListener("loadstart", function(a) {
          var b;
          if (b = a && a.url)
            a: {
              try {
                var m = document.createElement("a");
                m.href = a.url;
                b = m.host === f.host && "/blank/page.html" === m.pathname;
                break a;
              } catch (v) {}
              b = !1;
            }
          b && (a = rg(a.url), g.removeEventListener("exit", d), g.close(), a = new gg(null, null, {
            requestId: e.oc,
            requestKey: a
          }), e.Df.requestWithCredential("/auth/session", a, c), c = null);
        }), g.addEventListener("exit", d)) : c(yg("TRANSPORT_UNAVAILABLE"));
      };
      Bg.isAvailable = function() {
        return kg();
      };
      Bg.prototype.Bc = function() {
        return "redirect";
      };
      function Cg(a) {
        a.callback_parameter || (a.callback_parameter = "callback");
        this.options = a;
        window.__firebase_auth_jsonp = window.__firebase_auth_jsonp || {};
      }
      Cg.prototype.open = function(a, b, c) {
        function d() {
          c && (c(yg("REQUEST_INTERRUPTED")), c = null);
        }
        function e() {
          setTimeout(function() {
            window.__firebase_auth_jsonp[f] = void 0;
            wa(window.__firebase_auth_jsonp) && (window.__firebase_auth_jsonp = void 0);
            try {
              var a = document.getElementById(f);
              a && a.parentNode.removeChild(a);
            } catch (b) {}
          }, 1);
          pg(window, "beforeunload", d);
        }
        var f = "fn" + (new Date).getTime() + Math.floor(99999 * Math.random());
        b[this.options.callback_parameter] = "__firebase_auth_jsonp." + f;
        a += (/\?/.test(a) ? "" : "?") + jb(b);
        og(window, "beforeunload", d);
        window.__firebase_auth_jsonp[f] = function(a) {
          c && (c(null, a), c = null);
          e();
        };
        Dg(f, a, c);
      };
      function Dg(a, b, c) {
        setTimeout(function() {
          try {
            var d = document.createElement("script");
            d.type = "text/javascript";
            d.id = a;
            d.async = !0;
            d.src = b;
            d.onerror = function() {
              var b = document.getElementById(a);
              null !== b && b.parentNode.removeChild(b);
              c && c(yg("NETWORK_ERROR"));
            };
            var e = document.getElementsByTagName("head");
            (e && 0 != e.length ? e[0] : document.documentElement).appendChild(d);
          } catch (f) {
            c && c(yg("NETWORK_ERROR"));
          }
        }, 0);
      }
      Cg.isAvailable = function() {
        return !0;
      };
      Cg.prototype.Bc = function() {
        return "json";
      };
      function Eg(a, b, c, d) {
        If.call(this, ["auth_status"]);
        this.H = a;
        this.df = b;
        this.Sg = c;
        this.Ke = d;
        this.rc = new jg(a, [Dc, P]);
        this.nb = null;
        this.Re = !1;
        Fg(this);
      }
      ma(Eg, If);
      h = Eg.prototype;
      h.we = function() {
        return this.nb || null;
      };
      function Fg(a) {
        P.get("redirect_request_id") && Gg(a);
        var b = a.rc.get();
        b && b.token ? (Hg(a, b), a.df(b.token, function(c, d) {
          Ig(a, c, d, !1, b.token, b);
        }, function(b, d) {
          Jg(a, "resumeSession()", b, d);
        })) : Hg(a, null);
      }
      function Kg(a, b, c, d, e, f) {
        "firebaseio-demo.com" === a.H.domain && Q("Firebase authentication is not supported on demo Firebases (*.firebaseio-demo.com). To secure your Firebase, create a production Firebase at https://www.firebase.com.");
        a.df(b, function(f, k) {
          Ig(a, f, k, !0, b, c, d || {}, e);
        }, function(b, c) {
          Jg(a, "auth()", b, c, f);
        });
      }
      function Lg(a, b) {
        a.rc.clear();
        Hg(a, null);
        a.Sg(function(a, d) {
          if ("ok" === a)
            R(b, null);
          else {
            var e = (a || "error").toUpperCase(),
                f = e;
            d && (f += ": " + d);
            f = Error(f);
            f.code = e;
            R(b, f);
          }
        });
      }
      function Ig(a, b, c, d, e, f, g, k) {
        "ok" === b ? (d && (b = c.auth, f.auth = b, f.expires = c.expires, f.token = cd(e) ? e : "", c = null, b && u(b, "uid") ? c = w(b, "uid") : u(f, "uid") && (c = w(f, "uid")), f.uid = c, c = "custom", b && u(b, "provider") ? c = w(b, "provider") : u(f, "provider") && (c = w(f, "provider")), f.provider = c, a.rc.clear(), cd(e) && (g = g || {}, c = Dc, "sessionOnly" === g.remember && (c = P), "none" !== g.remember && a.rc.set(f, c)), Hg(a, f)), R(k, null, f)) : (a.rc.clear(), Hg(a, null), f = a = (b || "error").toUpperCase(), c && (f += ": " + c), f = Error(f), f.code = a, R(k, f));
      }
      function Jg(a, b, c, d, e) {
        Q(b + " was canceled: " + d);
        a.rc.clear();
        Hg(a, null);
        a = Error(d);
        a.code = c.toUpperCase();
        R(e, a);
      }
      function Mg(a, b, c, d, e) {
        Ng(a);
        c = new gg(d || {}, {}, c || {});
        Og(a, [Ag, Cg], "/auth/" + b, c, e);
      }
      function Pg(a, b, c, d) {
        Ng(a);
        var e = [zg, Bg];
        c = ig(c);
        "anonymous" === b || "password" === b ? setTimeout(function() {
          R(d, yg("TRANSPORT_UNAVAILABLE"));
        }, 0) : (c.ce.window_features = "menubar=yes,modal=yes,alwaysRaised=yeslocation=yes,resizable=yes,scrollbars=yes,status=yes,height=625,width=625,top=" + ("object" === typeof screen ? .5 * (screen.height - 625) : 0) + ",left=" + ("object" === typeof screen ? .5 * (screen.width - 625) : 0), c.ce.relay_url = tg(a.H.Cb), c.ce.requestWithCredential = q(a.pc, a), Og(a, e, "/auth/" + b, c, d));
      }
      function Gg(a) {
        var b = P.get("redirect_request_id");
        if (b) {
          var c = P.get("redirect_client_options");
          P.remove("redirect_request_id");
          P.remove("redirect_client_options");
          var d = [Ag, Cg],
              b = {
                requestId: b,
                requestKey: rg(document.location.hash)
              },
              c = new gg(c, {}, b);
          a.Re = !0;
          try {
            document.location.hash = document.location.hash.replace(/&__firebase_request_key=([a-zA-z0-9]*)/, "");
          } catch (e) {}
          Og(a, d, "/auth/session", c, function() {
            this.Re = !1;
          }.bind(a));
        }
      }
      h.re = function(a, b) {
        Ng(this);
        var c = ig(a);
        c.ab._method = "POST";
        this.pc("/users", c, function(a, c) {
          a ? R(b, a) : R(b, a, c);
        });
      };
      h.Se = function(a, b) {
        var c = this;
        Ng(this);
        var d = "/users/" + encodeURIComponent(a.email),
            e = ig(a);
        e.ab._method = "DELETE";
        this.pc(d, e, function(a, d) {
          !a && d && d.uid && c.nb && c.nb.uid && c.nb.uid === d.uid && Lg(c);
          R(b, a);
        });
      };
      h.oe = function(a, b) {
        Ng(this);
        var c = "/users/" + encodeURIComponent(a.email) + "/password",
            d = ig(a);
        d.ab._method = "PUT";
        d.ab.password = a.newPassword;
        this.pc(c, d, function(a) {
          R(b, a);
        });
      };
      h.ne = function(a, b) {
        Ng(this);
        var c = "/users/" + encodeURIComponent(a.oldEmail) + "/email",
            d = ig(a);
        d.ab._method = "PUT";
        d.ab.email = a.newEmail;
        d.ab.password = a.password;
        this.pc(c, d, function(a) {
          R(b, a);
        });
      };
      h.Ue = function(a, b) {
        Ng(this);
        var c = "/users/" + encodeURIComponent(a.email) + "/password",
            d = ig(a);
        d.ab._method = "POST";
        this.pc(c, d, function(a) {
          R(b, a);
        });
      };
      h.pc = function(a, b, c) {
        Qg(this, [Ag, Cg], a, b, c);
      };
      function Og(a, b, c, d, e) {
        Qg(a, b, c, d, function(b, c) {
          !b && c && c.token && c.uid ? Kg(a, c.token, c, d.ld, function(a, b) {
            a ? R(e, a) : R(e, null, b);
          }) : R(e, b || yg("UNKNOWN_ERROR"));
        });
      }
      function Qg(a, b, c, d, e) {
        b = Pa(b, function(a) {
          return "function" === typeof a.isAvailable && a.isAvailable();
        });
        0 === b.length ? setTimeout(function() {
          R(e, yg("TRANSPORT_UNAVAILABLE"));
        }, 0) : (b = new (b.shift())(d.ce), d = ib(d.ab), d.v = "js-2.2.4", d.transport = b.Bc(), d.suppress_status_codes = !0, a = sg() + "/" + a.H.Cb + c, b.open(a, d, function(a, b) {
          if (a)
            R(e, a);
          else if (b && b.error) {
            var c = Error(b.error.message);
            c.code = b.error.code;
            c.details = b.error.details;
            R(e, c);
          } else
            R(e, null, b);
        }));
      }
      function Hg(a, b) {
        var c = null !== a.nb || null !== b;
        a.nb = b;
        c && a.de("auth_status", b);
        a.Ke(null !== b);
      }
      h.ze = function(a) {
        J("auth_status" === a, 'initial event must be of type "auth_status"');
        return this.Re ? null : [this.nb];
      };
      function Ng(a) {
        var b = a.H;
        if ("firebaseio.com" !== b.domain && "firebaseio-demo.com" !== b.domain && "auth.firebase.com" === fg)
          throw Error("This custom Firebase server ('" + a.H.domain + "') does not support delegated login.");
      }
      ;
      function Rg(a) {
        this.hc = a;
        this.Kd = [];
        this.Qb = 0;
        this.pe = -1;
        this.Fb = null;
      }
      function Sg(a, b, c) {
        a.pe = b;
        a.Fb = c;
        a.pe < a.Qb && (a.Fb(), a.Fb = null);
      }
      function Tg(a, b, c) {
        for (a.Kd[b] = c; a.Kd[a.Qb]; ) {
          var d = a.Kd[a.Qb];
          delete a.Kd[a.Qb];
          for (var e = 0; e < d.length; ++e)
            if (d[e]) {
              var f = a;
              Cb(function() {
                f.hc(d[e]);
              });
            }
          if (a.Qb === a.pe) {
            a.Fb && (clearTimeout(a.Fb), a.Fb(), a.Fb = null);
            break;
          }
          a.Qb++;
        }
      }
      ;
      function Ug(a, b, c) {
        this.qe = a;
        this.f = Oc(a);
        this.ob = this.pb = 0;
        this.Va = Ob(b);
        this.Vd = c;
        this.Gc = !1;
        this.gd = function(a) {
          b.host !== b.Oa && (a.ns = b.Cb);
          var c = [],
              f;
          for (f in a)
            a.hasOwnProperty(f) && c.push(f + "=" + a[f]);
          return (b.lb ? "https://" : "http://") + b.Oa + "/.lp?" + c.join("&");
        };
      }
      var Vg,
          Wg;
      Ug.prototype.open = function(a, b) {
        this.gf = 0;
        this.ka = b;
        this.zf = new Rg(a);
        this.zb = !1;
        var c = this;
        this.rb = setTimeout(function() {
          c.f("Timed out trying to connect.");
          c.ib();
          c.rb = null;
        }, Math.floor(3E4));
        Tc(function() {
          if (!c.zb) {
            c.Ta = new Xg(function(a, b, d, k, l) {
              Yg(c, arguments);
              if (c.Ta)
                if (c.rb && (clearTimeout(c.rb), c.rb = null), c.Gc = !0, "start" == a)
                  c.id = b, c.Ff = d;
                else if ("close" === a)
                  b ? (c.Ta.Td = !1, Sg(c.zf, b, function() {
                    c.ib();
                  })) : c.ib();
                else
                  throw Error("Unrecognized command received: " + a);
            }, function(a, b) {
              Yg(c, arguments);
              Tg(c.zf, a, b);
            }, function() {
              c.ib();
            }, c.gd);
            var a = {start: "t"};
            a.ser = Math.floor(1E8 * Math.random());
            c.Ta.fe && (a.cb = c.Ta.fe);
            a.v = "5";
            c.Vd && (a.s = c.Vd);
            "undefined" !== typeof location && location.href && -1 !== location.href.indexOf("firebaseio.com") && (a.r = "f");
            a = c.gd(a);
            c.f("Connecting via long-poll to " + a);
            Zg(c.Ta, a, function() {});
          }
        });
      };
      Ug.prototype.start = function() {
        var a = this.Ta,
            b = this.Ff;
        a.rg = this.id;
        a.sg = b;
        for (a.ke = !0; $g(a); )
          ;
        a = this.id;
        b = this.Ff;
        this.fc = document.createElement("iframe");
        var c = {dframe: "t"};
        c.id = a;
        c.pw = b;
        this.fc.src = this.gd(c);
        this.fc.style.display = "none";
        document.body.appendChild(this.fc);
      };
      Ug.isAvailable = function() {
        return !Wg && !("object" === typeof window && window.chrome && window.chrome.extension && !/^chrome/.test(window.location.href)) && !("object" === typeof Windows && "object" === typeof Windows.Ug) && (Vg || !0);
      };
      h = Ug.prototype;
      h.Bd = function() {};
      h.cd = function() {
        this.zb = !0;
        this.Ta && (this.Ta.close(), this.Ta = null);
        this.fc && (document.body.removeChild(this.fc), this.fc = null);
        this.rb && (clearTimeout(this.rb), this.rb = null);
      };
      h.ib = function() {
        this.zb || (this.f("Longpoll is closing itself"), this.cd(), this.ka && (this.ka(this.Gc), this.ka = null));
      };
      h.close = function() {
        this.zb || (this.f("Longpoll is being closed."), this.cd());
      };
      h.send = function(a) {
        a = B(a);
        this.pb += a.length;
        Lb(this.Va, "bytes_sent", a.length);
        a = Kc(a);
        a = fb(a, !0);
        a = Xc(a, 1840);
        for (var b = 0; b < a.length; b++) {
          var c = this.Ta;
          c.$c.push({
            Jg: this.gf,
            Rg: a.length,
            jf: a[b]
          });
          c.ke && $g(c);
          this.gf++;
        }
      };
      function Yg(a, b) {
        var c = B(b).length;
        a.ob += c;
        Lb(a.Va, "bytes_received", c);
      }
      function Xg(a, b, c, d) {
        this.gd = d;
        this.jb = c;
        this.Oe = new cg;
        this.$c = [];
        this.se = Math.floor(1E8 * Math.random());
        this.Td = !0;
        this.fe = Gc();
        window["pLPCommand" + this.fe] = a;
        window["pRTLPCB" + this.fe] = b;
        a = document.createElement("iframe");
        a.style.display = "none";
        if (document.body) {
          document.body.appendChild(a);
          try {
            a.contentWindow.document || Bb("No IE domain setting required");
          } catch (e) {
            a.src = "javascript:void((function(){document.open();document.domain='" + document.domain + "';document.close();})())";
          }
        } else
          throw "Document body has not initialized. Wait to initialize Firebase until after the document is ready.";
        a.contentDocument ? a.gb = a.contentDocument : a.contentWindow ? a.gb = a.contentWindow.document : a.document && (a.gb = a.document);
        this.Ca = a;
        a = "";
        this.Ca.src && "javascript:" === this.Ca.src.substr(0, 11) && (a = '<script>document.domain="' + document.domain + '";\x3c/script>');
        a = "<html><body>" + a + "</body></html>";
        try {
          this.Ca.gb.open(), this.Ca.gb.write(a), this.Ca.gb.close();
        } catch (f) {
          Bb("frame writing exception"), f.stack && Bb(f.stack), Bb(f);
        }
      }
      Xg.prototype.close = function() {
        this.ke = !1;
        if (this.Ca) {
          this.Ca.gb.body.innerHTML = "";
          var a = this;
          setTimeout(function() {
            null !== a.Ca && (document.body.removeChild(a.Ca), a.Ca = null);
          }, Math.floor(0));
        }
        var b = this.jb;
        b && (this.jb = null, b());
      };
      function $g(a) {
        if (a.ke && a.Td && a.Oe.count() < (0 < a.$c.length ? 2 : 1)) {
          a.se++;
          var b = {};
          b.id = a.rg;
          b.pw = a.sg;
          b.ser = a.se;
          for (var b = a.gd(b),
              c = "",
              d = 0; 0 < a.$c.length; )
            if (1870 >= a.$c[0].jf.length + 30 + c.length) {
              var e = a.$c.shift(),
                  c = c + "&seg" + d + "=" + e.Jg + "&ts" + d + "=" + e.Rg + "&d" + d + "=" + e.jf;
              d++;
            } else
              break;
          ah(a, b + c, a.se);
          return !0;
        }
        return !1;
      }
      function ah(a, b, c) {
        function d() {
          a.Oe.remove(c);
          $g(a);
        }
        a.Oe.add(c, 1);
        var e = setTimeout(d, Math.floor(25E3));
        Zg(a, b, function() {
          clearTimeout(e);
          d();
        });
      }
      function Zg(a, b, c) {
        setTimeout(function() {
          try {
            if (a.Td) {
              var d = a.Ca.gb.createElement("script");
              d.type = "text/javascript";
              d.async = !0;
              d.src = b;
              d.onload = d.onreadystatechange = function() {
                var a = d.readyState;
                a && "loaded" !== a && "complete" !== a || (d.onload = d.onreadystatechange = null, d.parentNode && d.parentNode.removeChild(d), c());
              };
              d.onerror = function() {
                Bb("Long-poll script failed to load: " + b);
                a.Td = !1;
                a.close();
              };
              a.Ca.gb.body.appendChild(d);
            }
          } catch (e) {}
        }, Math.floor(1));
      }
      ;
      var bh = null;
      "undefined" !== typeof MozWebSocket ? bh = MozWebSocket : "undefined" !== typeof WebSocket && (bh = WebSocket);
      function ch(a, b, c) {
        this.qe = a;
        this.f = Oc(this.qe);
        this.frames = this.Jc = null;
        this.ob = this.pb = this.bf = 0;
        this.Va = Ob(b);
        this.fb = (b.lb ? "wss://" : "ws://") + b.Oa + "/.ws?v=5";
        "undefined" !== typeof location && location.href && -1 !== location.href.indexOf("firebaseio.com") && (this.fb += "&r=f");
        b.host !== b.Oa && (this.fb = this.fb + "&ns=" + b.Cb);
        c && (this.fb = this.fb + "&s=" + c);
      }
      var dh;
      ch.prototype.open = function(a, b) {
        this.jb = b;
        this.wg = a;
        this.f("Websocket connecting to " + this.fb);
        this.Gc = !1;
        Dc.set("previous_websocket_failure", !0);
        try {
          this.va = new bh(this.fb);
        } catch (c) {
          this.f("Error instantiating WebSocket.");
          var d = c.message || c.data;
          d && this.f(d);
          this.ib();
          return ;
        }
        var e = this;
        this.va.onopen = function() {
          e.f("Websocket connected.");
          e.Gc = !0;
        };
        this.va.onclose = function() {
          e.f("Websocket connection was disconnected.");
          e.va = null;
          e.ib();
        };
        this.va.onmessage = function(a) {
          if (null !== e.va)
            if (a = a.data, e.ob += a.length, Lb(e.Va, "bytes_received", a.length), eh(e), null !== e.frames)
              fh(e, a);
            else {
              a: {
                J(null === e.frames, "We already have a frame buffer");
                if (6 >= a.length) {
                  var b = Number(a);
                  if (!isNaN(b)) {
                    e.bf = b;
                    e.frames = [];
                    a = null;
                    break a;
                  }
                }
                e.bf = 1;
                e.frames = [];
              }
              null !== a && fh(e, a);
            }
        };
        this.va.onerror = function(a) {
          e.f("WebSocket error.  Closing connection.");
          (a = a.message || a.data) && e.f(a);
          e.ib();
        };
      };
      ch.prototype.start = function() {};
      ch.isAvailable = function() {
        var a = !1;
        if ("undefined" !== typeof navigator && navigator.userAgent) {
          var b = navigator.userAgent.match(/Android ([0-9]{0,}\.[0-9]{0,})/);
          b && 1 < b.length && 4.4 > parseFloat(b[1]) && (a = !0);
        }
        return !a && null !== bh && !dh;
      };
      ch.responsesRequiredToBeHealthy = 2;
      ch.healthyTimeout = 3E4;
      h = ch.prototype;
      h.Bd = function() {
        Dc.remove("previous_websocket_failure");
      };
      function fh(a, b) {
        a.frames.push(b);
        if (a.frames.length == a.bf) {
          var c = a.frames.join("");
          a.frames = null;
          c = mb(c);
          a.wg(c);
        }
      }
      h.send = function(a) {
        eh(this);
        a = B(a);
        this.pb += a.length;
        Lb(this.Va, "bytes_sent", a.length);
        a = Xc(a, 16384);
        1 < a.length && this.va.send(String(a.length));
        for (var b = 0; b < a.length; b++)
          this.va.send(a[b]);
      };
      h.cd = function() {
        this.zb = !0;
        this.Jc && (clearInterval(this.Jc), this.Jc = null);
        this.va && (this.va.close(), this.va = null);
      };
      h.ib = function() {
        this.zb || (this.f("WebSocket is closing itself"), this.cd(), this.jb && (this.jb(this.Gc), this.jb = null));
      };
      h.close = function() {
        this.zb || (this.f("WebSocket is being closed"), this.cd());
      };
      function eh(a) {
        clearInterval(a.Jc);
        a.Jc = setInterval(function() {
          a.va && a.va.send("0");
          eh(a);
        }, Math.floor(45E3));
      }
      ;
      function gh(a) {
        hh(this, a);
      }
      var ih = [Ug, ch];
      function hh(a, b) {
        var c = ch && ch.isAvailable(),
            d = c && !(Dc.uf || !0 === Dc.get("previous_websocket_failure"));
        b.Tg && (c || Q("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."), d = !0);
        if (d)
          a.ed = [ch];
        else {
          var e = a.ed = [];
          Yc(ih, function(a, b) {
            b && b.isAvailable() && e.push(b);
          });
        }
      }
      function jh(a) {
        if (0 < a.ed.length)
          return a.ed[0];
        throw Error("No transports available");
      }
      ;
      function kh(a, b, c, d, e, f) {
        this.id = a;
        this.f = Oc("c:" + this.id + ":");
        this.hc = c;
        this.Vc = d;
        this.ka = e;
        this.Me = f;
        this.H = b;
        this.Jd = [];
        this.ef = 0;
        this.Nf = new gh(b);
        this.Ua = 0;
        this.f("Connection created");
        lh(this);
      }
      function lh(a) {
        var b = jh(a.Nf);
        a.L = new b("c:" + a.id + ":" + a.ef++, a.H);
        a.Qe = b.responsesRequiredToBeHealthy || 0;
        var c = mh(a, a.L),
            d = nh(a, a.L);
        a.fd = a.L;
        a.bd = a.L;
        a.F = null;
        a.Ab = !1;
        setTimeout(function() {
          a.L && a.L.open(c, d);
        }, Math.floor(0));
        b = b.healthyTimeout || 0;
        0 < b && (a.vd = setTimeout(function() {
          a.vd = null;
          a.Ab || (a.L && 102400 < a.L.ob ? (a.f("Connection exceeded healthy timeout but has received " + a.L.ob + " bytes.  Marking connection healthy."), a.Ab = !0, a.L.Bd()) : a.L && 10240 < a.L.pb ? a.f("Connection exceeded healthy timeout but has sent " + a.L.pb + " bytes.  Leaving connection alive.") : (a.f("Closing unhealthy connection after timeout."), a.close()));
        }, Math.floor(b)));
      }
      function nh(a, b) {
        return function(c) {
          b === a.L ? (a.L = null, c || 0 !== a.Ua ? 1 === a.Ua && a.f("Realtime connection lost.") : (a.f("Realtime connection failed."), "s-" === a.H.Oa.substr(0, 2) && (Dc.remove("host:" + a.H.host), a.H.Oa = a.H.host)), a.close()) : b === a.F ? (a.f("Secondary connection lost."), c = a.F, a.F = null, a.fd !== c && a.bd !== c || a.close()) : a.f("closing an old connection");
        };
      }
      function mh(a, b) {
        return function(c) {
          if (2 != a.Ua)
            if (b === a.bd) {
              var d = Vc("t", c);
              c = Vc("d", c);
              if ("c" == d) {
                if (d = Vc("t", c), "d" in c)
                  if (c = c.d, "h" === d) {
                    var d = c.ts,
                        e = c.v,
                        f = c.h;
                    a.Vd = c.s;
                    Fc(a.H, f);
                    0 == a.Ua && (a.L.start(), oh(a, a.L, d), "5" !== e && Q("Protocol version mismatch detected"), c = a.Nf, (c = 1 < c.ed.length ? c.ed[1] : null) && ph(a, c));
                  } else if ("n" === d) {
                    a.f("recvd end transmission on primary");
                    a.bd = a.F;
                    for (c = 0; c < a.Jd.length; ++c)
                      a.Fd(a.Jd[c]);
                    a.Jd = [];
                    qh(a);
                  } else
                    "s" === d ? (a.f("Connection shutdown command received. Shutting down..."), a.Me && (a.Me(c), a.Me = null), a.ka = null, a.close()) : "r" === d ? (a.f("Reset packet received.  New host: " + c), Fc(a.H, c), 1 === a.Ua ? a.close() : (rh(a), lh(a))) : "e" === d ? Pc("Server Error: " + c) : "o" === d ? (a.f("got pong on primary."), sh(a), th(a)) : Pc("Unknown control packet command: " + d);
              } else
                "d" == d && a.Fd(c);
            } else if (b === a.F)
              if (d = Vc("t", c), c = Vc("d", c), "c" == d)
                "t" in c && (c = c.t, "a" === c ? uh(a) : "r" === c ? (a.f("Got a reset on secondary, closing it"), a.F.close(), a.fd !== a.F && a.bd !== a.F || a.close()) : "o" === c && (a.f("got pong on secondary."), a.Lf--, uh(a)));
              else if ("d" == d)
                a.Jd.push(c);
              else
                throw Error("Unknown protocol layer: " + d);
            else
              a.f("message on old connection");
        };
      }
      kh.prototype.Da = function(a) {
        vh(this, {
          t: "d",
          d: a
        });
      };
      function qh(a) {
        a.fd === a.F && a.bd === a.F && (a.f("cleaning up and promoting a connection: " + a.F.qe), a.L = a.F, a.F = null);
      }
      function uh(a) {
        0 >= a.Lf ? (a.f("Secondary connection is healthy."), a.Ab = !0, a.F.Bd(), a.F.start(), a.f("sending client ack on secondary"), a.F.send({
          t: "c",
          d: {
            t: "a",
            d: {}
          }
        }), a.f("Ending transmission on primary"), a.L.send({
          t: "c",
          d: {
            t: "n",
            d: {}
          }
        }), a.fd = a.F, qh(a)) : (a.f("sending ping on secondary."), a.F.send({
          t: "c",
          d: {
            t: "p",
            d: {}
          }
        }));
      }
      kh.prototype.Fd = function(a) {
        sh(this);
        this.hc(a);
      };
      function sh(a) {
        a.Ab || (a.Qe--, 0 >= a.Qe && (a.f("Primary connection is healthy."), a.Ab = !0, a.L.Bd()));
      }
      function ph(a, b) {
        a.F = new b("c:" + a.id + ":" + a.ef++, a.H, a.Vd);
        a.Lf = b.responsesRequiredToBeHealthy || 0;
        a.F.open(mh(a, a.F), nh(a, a.F));
        setTimeout(function() {
          a.F && (a.f("Timed out trying to upgrade."), a.F.close());
        }, Math.floor(6E4));
      }
      function oh(a, b, c) {
        a.f("Realtime connection established.");
        a.L = b;
        a.Ua = 1;
        a.Vc && (a.Vc(c), a.Vc = null);
        0 === a.Qe ? (a.f("Primary connection is healthy."), a.Ab = !0) : setTimeout(function() {
          th(a);
        }, Math.floor(5E3));
      }
      function th(a) {
        a.Ab || 1 !== a.Ua || (a.f("sending ping on primary."), vh(a, {
          t: "c",
          d: {
            t: "p",
            d: {}
          }
        }));
      }
      function vh(a, b) {
        if (1 !== a.Ua)
          throw "Connection is not connected";
        a.fd.send(b);
      }
      kh.prototype.close = function() {
        2 !== this.Ua && (this.f("Closing realtime connection."), this.Ua = 2, rh(this), this.ka && (this.ka(), this.ka = null));
      };
      function rh(a) {
        a.f("Shutting down all connections");
        a.L && (a.L.close(), a.L = null);
        a.F && (a.F.close(), a.F = null);
        a.vd && (clearTimeout(a.vd), a.vd = null);
      }
      ;
      function wh(a, b, c, d) {
        this.id = xh++;
        this.f = Oc("p:" + this.id + ":");
        this.wf = this.De = !1;
        this.aa = {};
        this.pa = [];
        this.Xc = 0;
        this.Uc = [];
        this.ma = !1;
        this.$a = 1E3;
        this.Cd = 3E5;
        this.Gb = b;
        this.Tc = c;
        this.Ne = d;
        this.H = a;
        this.We = null;
        this.Qd = {};
        this.Ig = 0;
        this.mf = !0;
        this.Kc = this.Fe = null;
        yh(this, 0);
        Mf.ub().Eb("visible", this.zg, this);
        -1 === a.host.indexOf("fblocal") && Lf.ub().Eb("online", this.xg, this);
      }
      var xh = 0,
          zh = 0;
      h = wh.prototype;
      h.Da = function(a, b, c) {
        var d = ++this.Ig;
        a = {
          r: d,
          a: a,
          b: b
        };
        this.f(B(a));
        J(this.ma, "sendRequest call when we're not connected not allowed.");
        this.Sa.Da(a);
        c && (this.Qd[d] = c);
      };
      h.xf = function(a, b, c, d) {
        var e = a.wa(),
            f = a.path.toString();
        this.f("Listen called for " + f + " " + e);
        this.aa[f] = this.aa[f] || {};
        J(!this.aa[f][e], "listen() called twice for same path/queryId.");
        a = {
          J: d,
          ud: b,
          Fg: a,
          tag: c
        };
        this.aa[f][e] = a;
        this.ma && Ah(this, a);
      };
      function Ah(a, b) {
        var c = b.Fg,
            d = c.path.toString(),
            e = c.wa();
        a.f("Listen on " + d + " for " + e);
        var f = {p: d};
        b.tag && (f.q = ce(c.n), f.t = b.tag);
        f.h = b.ud();
        a.Da("q", f, function(f) {
          var k = f.d,
              l = f.s;
          if (k && "object" === typeof k && u(k, "w")) {
            var m = w(k, "w");
            ea(m) && 0 <= Na(m, "no_index") && Q("Using an unspecified index. Consider adding " + ('".indexOn": "' + c.n.g.toString() + '"') + " at " + c.path.toString() + " to your security rules for better performance");
          }
          (a.aa[d] && a.aa[d][e]) === b && (a.f("listen response", f), "ok" !== l && Bh(a, d, e), b.J && b.J(l, k));
        });
      }
      h.P = function(a, b, c) {
        this.Fa = {
          fg: a,
          nf: !1,
          yc: b,
          jd: c
        };
        this.f("Authenticating using credential: " + a);
        Ch(this);
        (b = 40 == a.length) || (a = ad(a).Ac, b = "object" === typeof a && !0 === w(a, "admin"));
        b && (this.f("Admin auth credential detected.  Reducing max reconnect time."), this.Cd = 3E4);
      };
      h.ee = function(a) {
        delete this.Fa;
        this.ma && this.Da("unauth", {}, function(b) {
          a(b.s, b.d);
        });
      };
      function Ch(a) {
        var b = a.Fa;
        a.ma && b && a.Da("auth", {cred: b.fg}, function(c) {
          var d = c.s;
          c = c.d || "error";
          "ok" !== d && a.Fa === b && delete a.Fa;
          b.nf ? "ok" !== d && b.jd && b.jd(d, c) : (b.nf = !0, b.yc && b.yc(d, c));
        });
      }
      h.Of = function(a, b) {
        var c = a.path.toString(),
            d = a.wa();
        this.f("Unlisten called for " + c + " " + d);
        if (Bh(this, c, d) && this.ma) {
          var e = ce(a.n);
          this.f("Unlisten on " + c + " for " + d);
          c = {p: c};
          b && (c.q = e, c.t = b);
          this.Da("n", c);
        }
      };
      h.Le = function(a, b, c) {
        this.ma ? Dh(this, "o", a, b, c) : this.Uc.push({
          Zc: a,
          action: "o",
          data: b,
          J: c
        });
      };
      h.Bf = function(a, b, c) {
        this.ma ? Dh(this, "om", a, b, c) : this.Uc.push({
          Zc: a,
          action: "om",
          data: b,
          J: c
        });
      };
      h.Gd = function(a, b) {
        this.ma ? Dh(this, "oc", a, null, b) : this.Uc.push({
          Zc: a,
          action: "oc",
          data: null,
          J: b
        });
      };
      function Dh(a, b, c, d, e) {
        c = {
          p: c,
          d: d
        };
        a.f("onDisconnect " + b, c);
        a.Da(b, c, function(a) {
          e && setTimeout(function() {
            e(a.s, a.d);
          }, Math.floor(0));
        });
      }
      h.put = function(a, b, c, d) {
        Eh(this, "p", a, b, c, d);
      };
      h.yf = function(a, b, c, d) {
        Eh(this, "m", a, b, c, d);
      };
      function Eh(a, b, c, d, e, f) {
        d = {
          p: c,
          d: d
        };
        n(f) && (d.h = f);
        a.pa.push({
          action: b,
          If: d,
          J: e
        });
        a.Xc++;
        b = a.pa.length - 1;
        a.ma ? Fh(a, b) : a.f("Buffering put: " + c);
      }
      function Fh(a, b) {
        var c = a.pa[b].action,
            d = a.pa[b].If,
            e = a.pa[b].J;
        a.pa[b].Gg = a.ma;
        a.Da(c, d, function(d) {
          a.f(c + " response", d);
          delete a.pa[b];
          a.Xc--;
          0 === a.Xc && (a.pa = []);
          e && e(d.s, d.d);
        });
      }
      h.Te = function(a) {
        this.ma && (a = {c: a}, this.f("reportStats", a), this.Da("s", a, function(a) {
          "ok" !== a.s && this.f("reportStats", "Error sending stats: " + a.d);
        }));
      };
      h.Fd = function(a) {
        if ("r" in a) {
          this.f("from server: " + B(a));
          var b = a.r,
              c = this.Qd[b];
          c && (delete this.Qd[b], c(a.b));
        } else {
          if ("error" in a)
            throw "A server-side error has occurred: " + a.error;
          "a" in a && (b = a.a, c = a.b, this.f("handleServerMessage", b, c), "d" === b ? this.Gb(c.p, c.d, !1, c.t) : "m" === b ? this.Gb(c.p, c.d, !0, c.t) : "c" === b ? Gh(this, c.p, c.q) : "ac" === b ? (a = c.s, b = c.d, c = this.Fa, delete this.Fa, c && c.jd && c.jd(a, b)) : "sd" === b ? this.We ? this.We(c) : "msg" in c && "undefined" !== typeof console && console.log("FIREBASE: " + c.msg.replace("\n", "\nFIREBASE: ")) : Pc("Unrecognized action received from server: " + B(b) + "\nAre you using the latest client?"));
        }
      };
      h.Vc = function(a) {
        this.f("connection ready");
        this.ma = !0;
        this.Kc = (new Date).getTime();
        this.Ne({serverTimeOffset: a - (new Date).getTime()});
        this.mf && (a = {}, a["sdk.js." + "2.2.4".replace(/\./g, "-")] = 1, kg() && (a["framework.cordova"] = 1), this.Te(a));
        Hh(this);
        this.mf = !1;
        this.Tc(!0);
      };
      function yh(a, b) {
        J(!a.Sa, "Scheduling a connect when we're already connected/ing?");
        a.Sb && clearTimeout(a.Sb);
        a.Sb = setTimeout(function() {
          a.Sb = null;
          Ih(a);
        }, Math.floor(b));
      }
      h.zg = function(a) {
        a && !this.uc && this.$a === this.Cd && (this.f("Window became visible.  Reducing delay."), this.$a = 1E3, this.Sa || yh(this, 0));
        this.uc = a;
      };
      h.xg = function(a) {
        a ? (this.f("Browser went online."), this.$a = 1E3, this.Sa || yh(this, 0)) : (this.f("Browser went offline.  Killing connection."), this.Sa && this.Sa.close());
      };
      h.Cf = function() {
        this.f("data client disconnected");
        this.ma = !1;
        this.Sa = null;
        for (var a = 0; a < this.pa.length; a++) {
          var b = this.pa[a];
          b && "h" in b.If && b.Gg && (b.J && b.J("disconnect"), delete this.pa[a], this.Xc--);
        }
        0 === this.Xc && (this.pa = []);
        this.Qd = {};
        Jh(this) && (this.uc ? this.Kc && (3E4 < (new Date).getTime() - this.Kc && (this.$a = 1E3), this.Kc = null) : (this.f("Window isn't visible.  Delaying reconnect."), this.$a = this.Cd, this.Fe = (new Date).getTime()), a = Math.max(0, this.$a - ((new Date).getTime() - this.Fe)), a *= Math.random(), this.f("Trying to reconnect in " + a + "ms"), yh(this, a), this.$a = Math.min(this.Cd, 1.3 * this.$a));
        this.Tc(!1);
      };
      function Ih(a) {
        if (Jh(a)) {
          a.f("Making a connection attempt");
          a.Fe = (new Date).getTime();
          a.Kc = null;
          var b = q(a.Fd, a),
              c = q(a.Vc, a),
              d = q(a.Cf, a),
              e = a.id + ":" + zh++;
          a.Sa = new kh(e, a.H, b, c, d, function(b) {
            Q(b + " (" + a.H.toString() + ")");
            a.wf = !0;
          });
        }
      }
      h.yb = function() {
        this.De = !0;
        this.Sa ? this.Sa.close() : (this.Sb && (clearTimeout(this.Sb), this.Sb = null), this.ma && this.Cf());
      };
      h.qc = function() {
        this.De = !1;
        this.$a = 1E3;
        this.Sa || yh(this, 0);
      };
      function Gh(a, b, c) {
        c = c ? Qa(c, function(a) {
          return Wc(a);
        }).join("$") : "default";
        (a = Bh(a, b, c)) && a.J && a.J("permission_denied");
      }
      function Bh(a, b, c) {
        b = (new K(b)).toString();
        var d;
        n(a.aa[b]) ? (d = a.aa[b][c], delete a.aa[b][c], 0 === pa(a.aa[b]) && delete a.aa[b]) : d = void 0;
        return d;
      }
      function Hh(a) {
        Ch(a);
        r(a.aa, function(b) {
          r(b, function(b) {
            Ah(a, b);
          });
        });
        for (var b = 0; b < a.pa.length; b++)
          a.pa[b] && Fh(a, b);
        for (; a.Uc.length; )
          b = a.Uc.shift(), Dh(a, b.action, b.Zc, b.data, b.J);
      }
      function Jh(a) {
        var b;
        b = Lf.ub().ic;
        return !a.wf && !a.De && b;
      }
      ;
      var V = {lg: function() {
          Vg = dh = !0;
        }};
      V.forceLongPolling = V.lg;
      V.mg = function() {
        Wg = !0;
      };
      V.forceWebSockets = V.mg;
      V.Mg = function(a, b) {
        a.k.Ra.We = b;
      };
      V.setSecurityDebugCallback = V.Mg;
      V.Ye = function(a, b) {
        a.k.Ye(b);
      };
      V.stats = V.Ye;
      V.Ze = function(a, b) {
        a.k.Ze(b);
      };
      V.statsIncrementCounter = V.Ze;
      V.pd = function(a) {
        return a.k.pd;
      };
      V.dataUpdateCount = V.pd;
      V.pg = function(a, b) {
        a.k.Ce = b;
      };
      V.interceptServerData = V.pg;
      V.vg = function(a) {
        new ug(a);
      };
      V.onPopupOpen = V.vg;
      V.Kg = function(a) {
        fg = a;
      };
      V.setAuthenticationServer = V.Kg;
      function S(a, b, c) {
        this.B = a;
        this.V = b;
        this.g = c;
      }
      S.prototype.K = function() {
        x("Firebase.DataSnapshot.val", 0, 0, arguments.length);
        return this.B.K();
      };
      S.prototype.val = S.prototype.K;
      S.prototype.lf = function() {
        x("Firebase.DataSnapshot.exportVal", 0, 0, arguments.length);
        return this.B.K(!0);
      };
      S.prototype.exportVal = S.prototype.lf;
      S.prototype.kg = function() {
        x("Firebase.DataSnapshot.exists", 0, 0, arguments.length);
        return !this.B.e();
      };
      S.prototype.exists = S.prototype.kg;
      S.prototype.w = function(a) {
        x("Firebase.DataSnapshot.child", 0, 1, arguments.length);
        ga(a) && (a = String(a));
        Xf("Firebase.DataSnapshot.child", a);
        var b = new K(a),
            c = this.V.w(b);
        return new S(this.B.oa(b), c, M);
      };
      S.prototype.child = S.prototype.w;
      S.prototype.Ha = function(a) {
        x("Firebase.DataSnapshot.hasChild", 1, 1, arguments.length);
        Xf("Firebase.DataSnapshot.hasChild", a);
        var b = new K(a);
        return !this.B.oa(b).e();
      };
      S.prototype.hasChild = S.prototype.Ha;
      S.prototype.A = function() {
        x("Firebase.DataSnapshot.getPriority", 0, 0, arguments.length);
        return this.B.A().K();
      };
      S.prototype.getPriority = S.prototype.A;
      S.prototype.forEach = function(a) {
        x("Firebase.DataSnapshot.forEach", 1, 1, arguments.length);
        A("Firebase.DataSnapshot.forEach", 1, a, !1);
        if (this.B.N())
          return !1;
        var b = this;
        return !!this.B.U(this.g, function(c, d) {
          return a(new S(d, b.V.w(c), M));
        });
      };
      S.prototype.forEach = S.prototype.forEach;
      S.prototype.td = function() {
        x("Firebase.DataSnapshot.hasChildren", 0, 0, arguments.length);
        return this.B.N() ? !1 : !this.B.e();
      };
      S.prototype.hasChildren = S.prototype.td;
      S.prototype.name = function() {
        Q("Firebase.DataSnapshot.name() being deprecated. Please use Firebase.DataSnapshot.key() instead.");
        x("Firebase.DataSnapshot.name", 0, 0, arguments.length);
        return this.key();
      };
      S.prototype.name = S.prototype.name;
      S.prototype.key = function() {
        x("Firebase.DataSnapshot.key", 0, 0, arguments.length);
        return this.V.key();
      };
      S.prototype.key = S.prototype.key;
      S.prototype.Db = function() {
        x("Firebase.DataSnapshot.numChildren", 0, 0, arguments.length);
        return this.B.Db();
      };
      S.prototype.numChildren = S.prototype.Db;
      S.prototype.lc = function() {
        x("Firebase.DataSnapshot.ref", 0, 0, arguments.length);
        return this.V;
      };
      S.prototype.ref = S.prototype.lc;
      function Kh(a, b) {
        this.H = a;
        this.Va = Ob(a);
        this.ea = new ub;
        this.Ed = 1;
        this.Ra = null;
        b || 0 <= ("object" === typeof window && window.navigator && window.navigator.userAgent || "").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i) ? (this.ca = new Ae(this.H, q(this.Gb, this)), setTimeout(q(this.Tc, this, !0), 0)) : this.ca = this.Ra = new wh(this.H, q(this.Gb, this), q(this.Tc, this), q(this.Ne, this));
        this.Pg = Pb(a, q(function() {
          return new Jb(this.Va, this.ca);
        }, this));
        this.tc = new Cf;
        this.Be = new nb;
        var c = this;
        this.zd = new gf({
          Xe: function(a, b, f, g) {
            b = [];
            f = c.Be.j(a.path);
            f.e() || (b = jf(c.zd, new Ub(ze, a.path, f)), setTimeout(function() {
              g("ok");
            }, 0));
            return b;
          },
          Zd: ba
        });
        Lh(this, "connected", !1);
        this.ka = new qc;
        this.P = new Eg(a, q(this.ca.P, this.ca), q(this.ca.ee, this.ca), q(this.Ke, this));
        this.pd = 0;
        this.Ce = null;
        this.O = new gf({
          Xe: function(a, b, f, g) {
            c.ca.xf(a, f, b, function(b, e) {
              var f = g(b, e);
              zb(c.ea, a.path, f);
            });
            return [];
          },
          Zd: function(a, b) {
            c.ca.Of(a, b);
          }
        });
      }
      h = Kh.prototype;
      h.toString = function() {
        return (this.H.lb ? "https://" : "http://") + this.H.host;
      };
      h.name = function() {
        return this.H.Cb;
      };
      function Mh(a) {
        a = a.Be.j(new K(".info/serverTimeOffset")).K() || 0;
        return (new Date).getTime() + a;
      }
      function Nh(a) {
        a = a = {timestamp: Mh(a)};
        a.timestamp = a.timestamp || (new Date).getTime();
        return a;
      }
      h.Gb = function(a, b, c, d) {
        this.pd++;
        var e = new K(a);
        b = this.Ce ? this.Ce(a, b) : b;
        a = [];
        d ? c ? (b = na(b, function(a) {
          return L(a);
        }), a = rf(this.O, e, b, d)) : (b = L(b), a = nf(this.O, e, b, d)) : c ? (d = na(b, function(a) {
          return L(a);
        }), a = mf(this.O, e, d)) : (d = L(b), a = jf(this.O, new Ub(ze, e, d)));
        d = e;
        0 < a.length && (d = Oh(this, e));
        zb(this.ea, d, a);
      };
      h.Tc = function(a) {
        Lh(this, "connected", a);
        !1 === a && Ph(this);
      };
      h.Ne = function(a) {
        var b = this;
        Yc(a, function(a, d) {
          Lh(b, d, a);
        });
      };
      h.Ke = function(a) {
        Lh(this, "authenticated", a);
      };
      function Lh(a, b, c) {
        b = new K("/.info/" + b);
        c = L(c);
        var d = a.Be;
        d.Sd = d.Sd.G(b, c);
        c = jf(a.zd, new Ub(ze, b, c));
        zb(a.ea, b, c);
      }
      h.Kb = function(a, b, c, d) {
        this.f("set", {
          path: a.toString(),
          value: b,
          Xg: c
        });
        var e = Nh(this);
        b = L(b, c);
        var e = sc(b, e),
            f = this.Ed++,
            e = hf(this.O, a, e, f, !0);
        vb(this.ea, e);
        var g = this;
        this.ca.put(a.toString(), b.K(!0), function(b, c) {
          var e = "ok" === b;
          e || Q("set at " + a + " failed: " + b);
          e = lf(g.O, f, !e);
          zb(g.ea, a, e);
          Qh(d, b, c);
        });
        e = Rh(this, a);
        Oh(this, e);
        zb(this.ea, e, []);
      };
      h.update = function(a, b, c) {
        this.f("update", {
          path: a.toString(),
          value: b
        });
        var d = !0,
            e = Nh(this),
            f = {};
        r(b, function(a, b) {
          d = !1;
          var c = L(a);
          f[b] = sc(c, e);
        });
        if (d)
          Bb("update() called with empty data.  Don't do anything."), Qh(c, "ok");
        else {
          var g = this.Ed++,
              k = kf(this.O, a, f, g);
          vb(this.ea, k);
          var l = this;
          this.ca.yf(a.toString(), b, function(b, d) {
            var e = "ok" === b;
            e || Q("update at " + a + " failed: " + b);
            var e = lf(l.O, g, !e),
                f = a;
            0 < e.length && (f = Oh(l, a));
            zb(l.ea, f, e);
            Qh(c, b, d);
          });
          b = Rh(this, a);
          Oh(this, b);
          zb(this.ea, a, []);
        }
      };
      function Ph(a) {
        a.f("onDisconnectEvents");
        var b = Nh(a),
            c = [];
        rc(pc(a.ka, b), F, function(b, e) {
          c = c.concat(jf(a.O, new Ub(ze, b, e)));
          var f = Rh(a, b);
          Oh(a, f);
        });
        a.ka = new qc;
        zb(a.ea, F, c);
      }
      h.Gd = function(a, b) {
        var c = this;
        this.ca.Gd(a.toString(), function(d, e) {
          "ok" === d && eg(c.ka, a);
          Qh(b, d, e);
        });
      };
      function Sh(a, b, c, d) {
        var e = L(c);
        a.ca.Le(b.toString(), e.K(!0), function(c, g) {
          "ok" === c && a.ka.mc(b, e);
          Qh(d, c, g);
        });
      }
      function Th(a, b, c, d, e) {
        var f = L(c, d);
        a.ca.Le(b.toString(), f.K(!0), function(c, d) {
          "ok" === c && a.ka.mc(b, f);
          Qh(e, c, d);
        });
      }
      function Uh(a, b, c, d) {
        var e = !0,
            f;
        for (f in c)
          e = !1;
        e ? (Bb("onDisconnect().update() called with empty data.  Don't do anything."), Qh(d, "ok")) : a.ca.Bf(b.toString(), c, function(e, f) {
          if ("ok" === e)
            for (var l in c) {
              var m = L(c[l]);
              a.ka.mc(b.w(l), m);
            }
          Qh(d, e, f);
        });
      }
      function Vh(a, b, c) {
        c = ".info" === O(b.path) ? a.zd.Ob(b, c) : a.O.Ob(b, c);
        xb(a.ea, b.path, c);
      }
      h.yb = function() {
        this.Ra && this.Ra.yb();
      };
      h.qc = function() {
        this.Ra && this.Ra.qc();
      };
      h.Ye = function(a) {
        if ("undefined" !== typeof console) {
          a ? (this.Yd || (this.Yd = new Ib(this.Va)), a = this.Yd.get()) : a = this.Va.get();
          var b = Ra(sa(a), function(a, b) {
            return Math.max(b.length, a);
          }, 0),
              c;
          for (c in a) {
            for (var d = a[c],
                e = c.length; e < b + 2; e++)
              c += " ";
            console.log(c + d);
          }
        }
      };
      h.Ze = function(a) {
        Lb(this.Va, a);
        this.Pg.Mf[a] = !0;
      };
      h.f = function(a) {
        var b = "";
        this.Ra && (b = this.Ra.id + ":");
        Bb(b, arguments);
      };
      function Qh(a, b, c) {
        a && Cb(function() {
          if ("ok" == b)
            a(null);
          else {
            var d = (b || "error").toUpperCase(),
                e = d;
            c && (e += ": " + c);
            e = Error(e);
            e.code = d;
            a(e);
          }
        });
      }
      ;
      function Wh(a, b, c, d, e) {
        function f() {}
        a.f("transaction on " + b);
        var g = new U(a, b);
        g.Eb("value", f);
        c = {
          path: b,
          update: c,
          J: d,
          status: null,
          Ef: Gc(),
          cf: e,
          Kf: 0,
          ge: function() {
            g.gc("value", f);
          },
          je: null,
          Aa: null,
          md: null,
          nd: null,
          od: null
        };
        d = a.O.ua(b, void 0) || C;
        c.md = d;
        d = c.update(d.K());
        if (n(d)) {
          Sf("transaction failed: Data returned ", d, c.path);
          c.status = 1;
          e = Df(a.tc, b);
          var k = e.Ba() || [];
          k.push(c);
          Ef(e, k);
          "object" === typeof d && null !== d && u(d, ".priority") ? (k = w(d, ".priority"), J(Qf(k), "Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")) : k = (a.O.ua(b) || C).A().K();
          e = Nh(a);
          d = L(d, k);
          e = sc(d, e);
          c.nd = d;
          c.od = e;
          c.Aa = a.Ed++;
          c = hf(a.O, b, e, c.Aa, c.cf);
          zb(a.ea, b, c);
          Xh(a);
        } else
          c.ge(), c.nd = null, c.od = null, c.J && (a = new S(c.md, new U(a, c.path), M), c.J(null, !1, a));
      }
      function Xh(a, b) {
        var c = b || a.tc;
        b || Yh(a, c);
        if (null !== c.Ba()) {
          var d = Zh(a, c);
          J(0 < d.length, "Sending zero length transaction queue");
          Sa(d, function(a) {
            return 1 === a.status;
          }) && $h(a, c.path(), d);
        } else
          c.td() && c.U(function(b) {
            Xh(a, b);
          });
      }
      function $h(a, b, c) {
        for (var d = Qa(c, function(a) {
          return a.Aa;
        }),
            e = a.O.ua(b, d) || C,
            d = e,
            e = e.hash(),
            f = 0; f < c.length; f++) {
          var g = c[f];
          J(1 === g.status, "tryToSendTransactionQueue_: items in queue should all be run.");
          g.status = 2;
          g.Kf++;
          var k = N(b, g.path),
              d = d.G(k, g.nd);
        }
        d = d.K(!0);
        a.ca.put(b.toString(), d, function(d) {
          a.f("transaction put response", {
            path: b.toString(),
            status: d
          });
          var e = [];
          if ("ok" === d) {
            d = [];
            for (f = 0; f < c.length; f++) {
              c[f].status = 3;
              e = e.concat(lf(a.O, c[f].Aa));
              if (c[f].J) {
                var g = c[f].od,
                    k = new U(a, c[f].path);
                d.push(q(c[f].J, null, null, !0, new S(g, k, M)));
              }
              c[f].ge();
            }
            Yh(a, Df(a.tc, b));
            Xh(a);
            zb(a.ea, b, e);
            for (f = 0; f < d.length; f++)
              Cb(d[f]);
          } else {
            if ("datastale" === d)
              for (f = 0; f < c.length; f++)
                c[f].status = 4 === c[f].status ? 5 : 1;
            else
              for (Q("transaction at " + b.toString() + " failed: " + d), f = 0; f < c.length; f++)
                c[f].status = 5, c[f].je = d;
            Oh(a, b);
          }
        }, e);
      }
      function Oh(a, b) {
        var c = ai(a, b),
            d = c.path(),
            c = Zh(a, c);
        bi(a, c, d);
        return d;
      }
      function bi(a, b, c) {
        if (0 !== b.length) {
          for (var d = [],
              e = [],
              f = Qa(b, function(a) {
                return a.Aa;
              }),
              g = 0; g < b.length; g++) {
            var k = b[g],
                l = N(c, k.path),
                m = !1,
                v;
            J(null !== l, "rerunTransactionsUnderNode_: relativePath should not be null.");
            if (5 === k.status)
              m = !0, v = k.je, e = e.concat(lf(a.O, k.Aa, !0));
            else if (1 === k.status)
              if (25 <= k.Kf)
                m = !0, v = "maxretry", e = e.concat(lf(a.O, k.Aa, !0));
              else {
                var y = a.O.ua(k.path, f) || C;
                k.md = y;
                var I = b[g].update(y.K());
                n(I) ? (Sf("transaction failed: Data returned ", I, k.path), l = L(I), "object" === typeof I && null != I && u(I, ".priority") || (l = l.da(y.A())), y = k.Aa, I = Nh(a), I = sc(l, I), k.nd = l, k.od = I, k.Aa = a.Ed++, Va(f, y), e = e.concat(hf(a.O, k.path, I, k.Aa, k.cf)), e = e.concat(lf(a.O, y, !0))) : (m = !0, v = "nodata", e = e.concat(lf(a.O, k.Aa, !0)));
              }
            zb(a.ea, c, e);
            e = [];
            m && (b[g].status = 3, setTimeout(b[g].ge, Math.floor(0)), b[g].J && ("nodata" === v ? (k = new U(a, b[g].path), d.push(q(b[g].J, null, null, !1, new S(b[g].md, k, M)))) : d.push(q(b[g].J, null, Error(v), !1, null))));
          }
          Yh(a, a.tc);
          for (g = 0; g < d.length; g++)
            Cb(d[g]);
          Xh(a);
        }
      }
      function ai(a, b) {
        for (var c,
            d = a.tc; null !== (c = O(b)) && null === d.Ba(); )
          d = Df(d, c), b = G(b);
        return d;
      }
      function Zh(a, b) {
        var c = [];
        ci(a, b, c);
        c.sort(function(a, b) {
          return a.Ef - b.Ef;
        });
        return c;
      }
      function ci(a, b, c) {
        var d = b.Ba();
        if (null !== d)
          for (var e = 0; e < d.length; e++)
            c.push(d[e]);
        b.U(function(b) {
          ci(a, b, c);
        });
      }
      function Yh(a, b) {
        var c = b.Ba();
        if (c) {
          for (var d = 0,
              e = 0; e < c.length; e++)
            3 !== c[e].status && (c[d] = c[e], d++);
          c.length = d;
          Ef(b, 0 < c.length ? c : null);
        }
        b.U(function(b) {
          Yh(a, b);
        });
      }
      function Rh(a, b) {
        var c = ai(a, b).path(),
            d = Df(a.tc, b);
        Hf(d, function(b) {
          di(a, b);
        });
        di(a, d);
        Gf(d, function(b) {
          di(a, b);
        });
        return c;
      }
      function di(a, b) {
        var c = b.Ba();
        if (null !== c) {
          for (var d = [],
              e = [],
              f = -1,
              g = 0; g < c.length; g++)
            4 !== c[g].status && (2 === c[g].status ? (J(f === g - 1, "All SENT items should be at beginning of queue."), f = g, c[g].status = 4, c[g].je = "set") : (J(1 === c[g].status, "Unexpected transaction status in abort"), c[g].ge(), e = e.concat(lf(a.O, c[g].Aa, !0)), c[g].J && d.push(q(c[g].J, null, Error("set"), !1, null))));
          -1 === f ? Ef(b, null) : c.length = f + 1;
          zb(a.ea, b.path(), e);
          for (g = 0; g < d.length; g++)
            Cb(d[g]);
        }
      }
      ;
      function W() {
        this.nc = {};
        this.Pf = !1;
      }
      ca(W);
      W.prototype.yb = function() {
        for (var a in this.nc)
          this.nc[a].yb();
      };
      W.prototype.interrupt = W.prototype.yb;
      W.prototype.qc = function() {
        for (var a in this.nc)
          this.nc[a].qc();
      };
      W.prototype.resume = W.prototype.qc;
      W.prototype.ue = function() {
        this.Pf = !0;
      };
      function X(a, b) {
        this.ad = a;
        this.qa = b;
      }
      X.prototype.cancel = function(a) {
        x("Firebase.onDisconnect().cancel", 0, 1, arguments.length);
        A("Firebase.onDisconnect().cancel", 1, a, !0);
        this.ad.Gd(this.qa, a || null);
      };
      X.prototype.cancel = X.prototype.cancel;
      X.prototype.remove = function(a) {
        x("Firebase.onDisconnect().remove", 0, 1, arguments.length);
        Yf("Firebase.onDisconnect().remove", this.qa);
        A("Firebase.onDisconnect().remove", 1, a, !0);
        Sh(this.ad, this.qa, null, a);
      };
      X.prototype.remove = X.prototype.remove;
      X.prototype.set = function(a, b) {
        x("Firebase.onDisconnect().set", 1, 2, arguments.length);
        Yf("Firebase.onDisconnect().set", this.qa);
        Rf("Firebase.onDisconnect().set", a, this.qa, !1);
        A("Firebase.onDisconnect().set", 2, b, !0);
        Sh(this.ad, this.qa, a, b);
      };
      X.prototype.set = X.prototype.set;
      X.prototype.Kb = function(a, b, c) {
        x("Firebase.onDisconnect().setWithPriority", 2, 3, arguments.length);
        Yf("Firebase.onDisconnect().setWithPriority", this.qa);
        Rf("Firebase.onDisconnect().setWithPriority", a, this.qa, !1);
        Uf("Firebase.onDisconnect().setWithPriority", 2, b);
        A("Firebase.onDisconnect().setWithPriority", 3, c, !0);
        Th(this.ad, this.qa, a, b, c);
      };
      X.prototype.setWithPriority = X.prototype.Kb;
      X.prototype.update = function(a, b) {
        x("Firebase.onDisconnect().update", 1, 2, arguments.length);
        Yf("Firebase.onDisconnect().update", this.qa);
        if (ea(a)) {
          for (var c = {},
              d = 0; d < a.length; ++d)
            c["" + d] = a[d];
          a = c;
          Q("Passing an Array to Firebase.onDisconnect().update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.");
        }
        Tf("Firebase.onDisconnect().update", a, this.qa);
        A("Firebase.onDisconnect().update", 2, b, !0);
        Uh(this.ad, this.qa, a, b);
      };
      X.prototype.update = X.prototype.update;
      function Y(a, b, c, d) {
        this.k = a;
        this.path = b;
        this.n = c;
        this.jc = d;
      }
      function ei(a) {
        var b = null,
            c = null;
        a.la && (b = od(a));
        a.na && (c = qd(a));
        if (a.g === Vd) {
          if (a.la) {
            if ("[MIN_NAME]" != nd(a))
              throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");
            if ("string" !== typeof b)
              throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");
          }
          if (a.na) {
            if ("[MAX_NAME]" != pd(a))
              throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");
            if ("string" !== typeof c)
              throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");
          }
        } else if (a.g === M) {
          if (null != b && !Qf(b) || null != c && !Qf(c))
            throw Error("Query: When ordering by priority, the first argument passed to startAt(), endAt(), or equalTo() must be a valid priority value (null, a number, or a string).");
        } else if (J(a.g instanceof Rd || a.g === Yd, "unknown index type."), null != b && "object" === typeof b || null != c && "object" === typeof c)
          throw Error("Query: First argument passed to startAt(), endAt(), or equalTo() cannot be an object.");
      }
      function fi(a) {
        if (a.la && a.na && a.ia && (!a.ia || "" === a.Nb))
          throw Error("Query: Can't combine startAt(), endAt(), and limit(). Use limitToFirst() or limitToLast() instead.");
      }
      function gi(a, b) {
        if (!0 === a.jc)
          throw Error(b + ": You can't combine multiple orderBy calls.");
      }
      Y.prototype.lc = function() {
        x("Query.ref", 0, 0, arguments.length);
        return new U(this.k, this.path);
      };
      Y.prototype.ref = Y.prototype.lc;
      Y.prototype.Eb = function(a, b, c, d) {
        x("Query.on", 2, 4, arguments.length);
        Vf("Query.on", a, !1);
        A("Query.on", 2, b, !1);
        var e = hi("Query.on", c, d);
        if ("value" === a)
          Vh(this.k, this, new jd(b, e.cancel || null, e.Ma || null));
        else {
          var f = {};
          f[a] = b;
          Vh(this.k, this, new kd(f, e.cancel, e.Ma));
        }
        return b;
      };
      Y.prototype.on = Y.prototype.Eb;
      Y.prototype.gc = function(a, b, c) {
        x("Query.off", 0, 3, arguments.length);
        Vf("Query.off", a, !0);
        A("Query.off", 2, b, !0);
        lb("Query.off", 3, c);
        var d = null,
            e = null;
        "value" === a ? d = new jd(b || null, null, c || null) : a && (b && (e = {}, e[a] = b), d = new kd(e, null, c || null));
        e = this.k;
        d = ".info" === O(this.path) ? e.zd.kb(this, d) : e.O.kb(this, d);
        xb(e.ea, this.path, d);
      };
      Y.prototype.off = Y.prototype.gc;
      Y.prototype.Ag = function(a, b) {
        function c(g) {
          f && (f = !1, e.gc(a, c), b.call(d.Ma, g));
        }
        x("Query.once", 2, 4, arguments.length);
        Vf("Query.once", a, !1);
        A("Query.once", 2, b, !1);
        var d = hi("Query.once", arguments[2], arguments[3]),
            e = this,
            f = !0;
        this.Eb(a, c, function(b) {
          e.gc(a, c);
          d.cancel && d.cancel.call(d.Ma, b);
        });
      };
      Y.prototype.once = Y.prototype.Ag;
      Y.prototype.Ge = function(a) {
        Q("Query.limit() being deprecated. Please use Query.limitToFirst() or Query.limitToLast() instead.");
        x("Query.limit", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limit: First argument must be a positive integer.");
        if (this.n.ia)
          throw Error("Query.limit: Limit was already set (by another call to limit, limitToFirst, orlimitToLast.");
        var b = this.n.Ge(a);
        fi(b);
        return new Y(this.k, this.path, b, this.jc);
      };
      Y.prototype.limit = Y.prototype.Ge;
      Y.prototype.He = function(a) {
        x("Query.limitToFirst", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limitToFirst: First argument must be a positive integer.");
        if (this.n.ia)
          throw Error("Query.limitToFirst: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");
        return new Y(this.k, this.path, this.n.He(a), this.jc);
      };
      Y.prototype.limitToFirst = Y.prototype.He;
      Y.prototype.Ie = function(a) {
        x("Query.limitToLast", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limitToLast: First argument must be a positive integer.");
        if (this.n.ia)
          throw Error("Query.limitToLast: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");
        return new Y(this.k, this.path, this.n.Ie(a), this.jc);
      };
      Y.prototype.limitToLast = Y.prototype.Ie;
      Y.prototype.Bg = function(a) {
        x("Query.orderByChild", 1, 1, arguments.length);
        if ("$key" === a)
          throw Error('Query.orderByChild: "$key" is invalid.  Use Query.orderByKey() instead.');
        if ("$priority" === a)
          throw Error('Query.orderByChild: "$priority" is invalid.  Use Query.orderByPriority() instead.');
        if ("$value" === a)
          throw Error('Query.orderByChild: "$value" is invalid.  Use Query.orderByValue() instead.');
        Wf("Query.orderByChild", 1, a, !1);
        gi(this, "Query.orderByChild");
        var b = be(this.n, new Rd(a));
        ei(b);
        return new Y(this.k, this.path, b, !0);
      };
      Y.prototype.orderByChild = Y.prototype.Bg;
      Y.prototype.Cg = function() {
        x("Query.orderByKey", 0, 0, arguments.length);
        gi(this, "Query.orderByKey");
        var a = be(this.n, Vd);
        ei(a);
        return new Y(this.k, this.path, a, !0);
      };
      Y.prototype.orderByKey = Y.prototype.Cg;
      Y.prototype.Dg = function() {
        x("Query.orderByPriority", 0, 0, arguments.length);
        gi(this, "Query.orderByPriority");
        var a = be(this.n, M);
        ei(a);
        return new Y(this.k, this.path, a, !0);
      };
      Y.prototype.orderByPriority = Y.prototype.Dg;
      Y.prototype.Eg = function() {
        x("Query.orderByValue", 0, 0, arguments.length);
        gi(this, "Query.orderByValue");
        var a = be(this.n, Yd);
        ei(a);
        return new Y(this.k, this.path, a, !0);
      };
      Y.prototype.orderByValue = Y.prototype.Eg;
      Y.prototype.Xd = function(a, b) {
        x("Query.startAt", 0, 2, arguments.length);
        Rf("Query.startAt", a, this.path, !0);
        Wf("Query.startAt", 2, b, !0);
        var c = this.n.Xd(a, b);
        fi(c);
        ei(c);
        if (this.n.la)
          throw Error("Query.startAt: Starting point was already set (by another call to startAt or equalTo).");
        n(a) || (b = a = null);
        return new Y(this.k, this.path, c, this.jc);
      };
      Y.prototype.startAt = Y.prototype.Xd;
      Y.prototype.qd = function(a, b) {
        x("Query.endAt", 0, 2, arguments.length);
        Rf("Query.endAt", a, this.path, !0);
        Wf("Query.endAt", 2, b, !0);
        var c = this.n.qd(a, b);
        fi(c);
        ei(c);
        if (this.n.na)
          throw Error("Query.endAt: Ending point was already set (by another call to endAt or equalTo).");
        return new Y(this.k, this.path, c, this.jc);
      };
      Y.prototype.endAt = Y.prototype.qd;
      Y.prototype.hg = function(a, b) {
        x("Query.equalTo", 1, 2, arguments.length);
        Rf("Query.equalTo", a, this.path, !1);
        Wf("Query.equalTo", 2, b, !0);
        if (this.n.la)
          throw Error("Query.equalTo: Starting point was already set (by another call to endAt or equalTo).");
        if (this.n.na)
          throw Error("Query.equalTo: Ending point was already set (by another call to endAt or equalTo).");
        return this.Xd(a, b).qd(a, b);
      };
      Y.prototype.equalTo = Y.prototype.hg;
      Y.prototype.toString = function() {
        x("Query.toString", 0, 0, arguments.length);
        for (var a = this.path,
            b = "",
            c = a.Y; c < a.o.length; c++)
          "" !== a.o[c] && (b += "/" + encodeURIComponent(String(a.o[c])));
        a = this.k.toString() + (b || "/");
        b = jb(ee(this.n));
        return a += b.replace(/^&/, "");
      };
      Y.prototype.toString = Y.prototype.toString;
      Y.prototype.wa = function() {
        var a = Wc(ce(this.n));
        return "{}" === a ? "default" : a;
      };
      function hi(a, b, c) {
        var d = {
          cancel: null,
          Ma: null
        };
        if (b && c)
          d.cancel = b, A(a, 3, d.cancel, !0), d.Ma = c, lb(a, 4, d.Ma);
        else if (b)
          if ("object" === typeof b && null !== b)
            d.Ma = b;
          else if ("function" === typeof b)
            d.cancel = b;
          else
            throw Error(z(a, 3, !0) + " must either be a cancel callback or a context object.");
        return d;
      }
      ;
      var Z = {};
      Z.vc = wh;
      Z.DataConnection = Z.vc;
      wh.prototype.Og = function(a, b) {
        this.Da("q", {p: a}, b);
      };
      Z.vc.prototype.simpleListen = Z.vc.prototype.Og;
      wh.prototype.gg = function(a, b) {
        this.Da("echo", {d: a}, b);
      };
      Z.vc.prototype.echo = Z.vc.prototype.gg;
      wh.prototype.interrupt = wh.prototype.yb;
      Z.Sf = kh;
      Z.RealTimeConnection = Z.Sf;
      kh.prototype.sendRequest = kh.prototype.Da;
      kh.prototype.close = kh.prototype.close;
      Z.og = function(a) {
        var b = wh.prototype.put;
        wh.prototype.put = function(c, d, e, f) {
          n(f) && (f = a());
          b.call(this, c, d, e, f);
        };
        return function() {
          wh.prototype.put = b;
        };
      };
      Z.hijackHash = Z.og;
      Z.Rf = Ec;
      Z.ConnectionTarget = Z.Rf;
      Z.wa = function(a) {
        return a.wa();
      };
      Z.queryIdentifier = Z.wa;
      Z.qg = function(a) {
        return a.k.Ra.aa;
      };
      Z.listens = Z.qg;
      Z.ue = function(a) {
        a.ue();
      };
      Z.forceRestClient = Z.ue;
      function U(a, b) {
        var c,
            d,
            e;
        if (a instanceof Kh)
          c = a, d = b;
        else {
          x("new Firebase", 1, 2, arguments.length);
          d = Rc(arguments[0]);
          c = d.Qg;
          "firebase" === d.domain && Qc(d.host + " is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead");
          c || Qc("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com");
          d.lb || "undefined" !== typeof window && window.location && window.location.protocol && -1 !== window.location.protocol.indexOf("https:") && Q("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().");
          c = new Ec(d.host, d.lb, c, "ws" === d.scheme || "wss" === d.scheme);
          d = new K(d.Zc);
          e = d.toString();
          var f;
          !(f = !p(c.host) || 0 === c.host.length || !Pf(c.Cb)) && (f = 0 !== e.length) && (e && (e = e.replace(/^\/*\.info(\/|$)/, "/")), f = !(p(e) && 0 !== e.length && !Of.test(e)));
          if (f)
            throw Error(z("new Firebase", 1, !1) + 'must be a valid firebase URL and the path can\'t contain ".", "#", "$", "[", or "]".');
          if (b)
            if (b instanceof W)
              e = b;
            else if (p(b))
              e = W.ub(), c.Ld = b;
            else
              throw Error("Expected a valid Firebase.Context for second argument to new Firebase()");
          else
            e = W.ub();
          f = c.toString();
          var g = w(e.nc, f);
          g || (g = new Kh(c, e.Pf), e.nc[f] = g);
          c = g;
        }
        Y.call(this, c, d, $d, !1);
      }
      ma(U, Y);
      var ii = U,
          ji = ["Firebase"],
          ki = aa;
      ji[0] in ki || !ki.execScript || ki.execScript("var " + ji[0]);
      for (var li; ji.length && (li = ji.shift()); )
        !ji.length && n(ii) ? ki[li] = ii : ki = ki[li] ? ki[li] : ki[li] = {};
      U.prototype.name = function() {
        Q("Firebase.name() being deprecated. Please use Firebase.key() instead.");
        x("Firebase.name", 0, 0, arguments.length);
        return this.key();
      };
      U.prototype.name = U.prototype.name;
      U.prototype.key = function() {
        x("Firebase.key", 0, 0, arguments.length);
        return this.path.e() ? null : vc(this.path);
      };
      U.prototype.key = U.prototype.key;
      U.prototype.w = function(a) {
        x("Firebase.child", 1, 1, arguments.length);
        if (ga(a))
          a = String(a);
        else if (!(a instanceof K))
          if (null === O(this.path)) {
            var b = a;
            b && (b = b.replace(/^\/*\.info(\/|$)/, "/"));
            Xf("Firebase.child", b);
          } else
            Xf("Firebase.child", a);
        return new U(this.k, this.path.w(a));
      };
      U.prototype.child = U.prototype.w;
      U.prototype.parent = function() {
        x("Firebase.parent", 0, 0, arguments.length);
        var a = this.path.parent();
        return null === a ? null : new U(this.k, a);
      };
      U.prototype.parent = U.prototype.parent;
      U.prototype.root = function() {
        x("Firebase.ref", 0, 0, arguments.length);
        for (var a = this; null !== a.parent(); )
          a = a.parent();
        return a;
      };
      U.prototype.root = U.prototype.root;
      U.prototype.set = function(a, b) {
        x("Firebase.set", 1, 2, arguments.length);
        Yf("Firebase.set", this.path);
        Rf("Firebase.set", a, this.path, !1);
        A("Firebase.set", 2, b, !0);
        this.k.Kb(this.path, a, null, b || null);
      };
      U.prototype.set = U.prototype.set;
      U.prototype.update = function(a, b) {
        x("Firebase.update", 1, 2, arguments.length);
        Yf("Firebase.update", this.path);
        if (ea(a)) {
          for (var c = {},
              d = 0; d < a.length; ++d)
            c["" + d] = a[d];
          a = c;
          Q("Passing an Array to Firebase.update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.");
        }
        Tf("Firebase.update", a, this.path);
        A("Firebase.update", 2, b, !0);
        this.k.update(this.path, a, b || null);
      };
      U.prototype.update = U.prototype.update;
      U.prototype.Kb = function(a, b, c) {
        x("Firebase.setWithPriority", 2, 3, arguments.length);
        Yf("Firebase.setWithPriority", this.path);
        Rf("Firebase.setWithPriority", a, this.path, !1);
        Uf("Firebase.setWithPriority", 2, b);
        A("Firebase.setWithPriority", 3, c, !0);
        if (".length" === this.key() || ".keys" === this.key())
          throw "Firebase.setWithPriority failed: " + this.key() + " is a read-only object.";
        this.k.Kb(this.path, a, b, c || null);
      };
      U.prototype.setWithPriority = U.prototype.Kb;
      U.prototype.remove = function(a) {
        x("Firebase.remove", 0, 1, arguments.length);
        Yf("Firebase.remove", this.path);
        A("Firebase.remove", 1, a, !0);
        this.set(null, a);
      };
      U.prototype.remove = U.prototype.remove;
      U.prototype.transaction = function(a, b, c) {
        x("Firebase.transaction", 1, 3, arguments.length);
        Yf("Firebase.transaction", this.path);
        A("Firebase.transaction", 1, a, !1);
        A("Firebase.transaction", 2, b, !0);
        if (n(c) && "boolean" != typeof c)
          throw Error(z("Firebase.transaction", 3, !0) + "must be a boolean.");
        if (".length" === this.key() || ".keys" === this.key())
          throw "Firebase.transaction failed: " + this.key() + " is a read-only object.";
        "undefined" === typeof c && (c = !0);
        Wh(this.k, this.path, a, b || null, c);
      };
      U.prototype.transaction = U.prototype.transaction;
      U.prototype.Lg = function(a, b) {
        x("Firebase.setPriority", 1, 2, arguments.length);
        Yf("Firebase.setPriority", this.path);
        Uf("Firebase.setPriority", 1, a);
        A("Firebase.setPriority", 2, b, !0);
        this.k.Kb(this.path.w(".priority"), a, null, b);
      };
      U.prototype.setPriority = U.prototype.Lg;
      U.prototype.push = function(a, b) {
        x("Firebase.push", 0, 2, arguments.length);
        Yf("Firebase.push", this.path);
        Rf("Firebase.push", a, this.path, !0);
        A("Firebase.push", 2, b, !0);
        var c = Mh(this.k),
            c = Kf(c),
            c = this.w(c);
        "undefined" !== typeof a && null !== a && c.set(a, b);
        return c;
      };
      U.prototype.push = U.prototype.push;
      U.prototype.jb = function() {
        Yf("Firebase.onDisconnect", this.path);
        return new X(this.k, this.path);
      };
      U.prototype.onDisconnect = U.prototype.jb;
      U.prototype.P = function(a, b, c) {
        Q("FirebaseRef.auth() being deprecated. Please use FirebaseRef.authWithCustomToken() instead.");
        x("Firebase.auth", 1, 3, arguments.length);
        Zf("Firebase.auth", a);
        A("Firebase.auth", 2, b, !0);
        A("Firebase.auth", 3, b, !0);
        Kg(this.k.P, a, {}, {remember: "none"}, b, c);
      };
      U.prototype.auth = U.prototype.P;
      U.prototype.ee = function(a) {
        x("Firebase.unauth", 0, 1, arguments.length);
        A("Firebase.unauth", 1, a, !0);
        Lg(this.k.P, a);
      };
      U.prototype.unauth = U.prototype.ee;
      U.prototype.we = function() {
        x("Firebase.getAuth", 0, 0, arguments.length);
        return this.k.P.we();
      };
      U.prototype.getAuth = U.prototype.we;
      U.prototype.ug = function(a, b) {
        x("Firebase.onAuth", 1, 2, arguments.length);
        A("Firebase.onAuth", 1, a, !1);
        lb("Firebase.onAuth", 2, b);
        this.k.P.Eb("auth_status", a, b);
      };
      U.prototype.onAuth = U.prototype.ug;
      U.prototype.tg = function(a, b) {
        x("Firebase.offAuth", 1, 2, arguments.length);
        A("Firebase.offAuth", 1, a, !1);
        lb("Firebase.offAuth", 2, b);
        this.k.P.gc("auth_status", a, b);
      };
      U.prototype.offAuth = U.prototype.tg;
      U.prototype.Wf = function(a, b, c) {
        x("Firebase.authWithCustomToken", 2, 3, arguments.length);
        Zf("Firebase.authWithCustomToken", a);
        A("Firebase.authWithCustomToken", 2, b, !1);
        ag("Firebase.authWithCustomToken", 3, c, !0);
        Kg(this.k.P, a, {}, c || {}, b);
      };
      U.prototype.authWithCustomToken = U.prototype.Wf;
      U.prototype.Xf = function(a, b, c) {
        x("Firebase.authWithOAuthPopup", 2, 3, arguments.length);
        $f("Firebase.authWithOAuthPopup", 1, a);
        A("Firebase.authWithOAuthPopup", 2, b, !1);
        ag("Firebase.authWithOAuthPopup", 3, c, !0);
        Pg(this.k.P, a, c, b);
      };
      U.prototype.authWithOAuthPopup = U.prototype.Xf;
      U.prototype.Yf = function(a, b, c) {
        x("Firebase.authWithOAuthRedirect", 2, 3, arguments.length);
        $f("Firebase.authWithOAuthRedirect", 1, a);
        A("Firebase.authWithOAuthRedirect", 2, b, !1);
        ag("Firebase.authWithOAuthRedirect", 3, c, !0);
        var d = this.k.P;
        Ng(d);
        var e = [wg],
            f = ig(c);
        "anonymous" === a || "firebase" === a ? R(b, yg("TRANSPORT_UNAVAILABLE")) : (P.set("redirect_client_options", f.ld), Og(d, e, "/auth/" + a, f, b));
      };
      U.prototype.authWithOAuthRedirect = U.prototype.Yf;
      U.prototype.Zf = function(a, b, c, d) {
        x("Firebase.authWithOAuthToken", 3, 4, arguments.length);
        $f("Firebase.authWithOAuthToken", 1, a);
        A("Firebase.authWithOAuthToken", 3, c, !1);
        ag("Firebase.authWithOAuthToken", 4, d, !0);
        p(b) ? ($f("Firebase.authWithOAuthToken", 2, b), Mg(this.k.P, a + "/token", {access_token: b}, d, c)) : (ag("Firebase.authWithOAuthToken", 2, b, !1), Mg(this.k.P, a + "/token", b, d, c));
      };
      U.prototype.authWithOAuthToken = U.prototype.Zf;
      U.prototype.Vf = function(a, b) {
        x("Firebase.authAnonymously", 1, 2, arguments.length);
        A("Firebase.authAnonymously", 1, a, !1);
        ag("Firebase.authAnonymously", 2, b, !0);
        Mg(this.k.P, "anonymous", {}, b, a);
      };
      U.prototype.authAnonymously = U.prototype.Vf;
      U.prototype.$f = function(a, b, c) {
        x("Firebase.authWithPassword", 2, 3, arguments.length);
        ag("Firebase.authWithPassword", 1, a, !1);
        bg("Firebase.authWithPassword", a, "email");
        bg("Firebase.authWithPassword", a, "password");
        A("Firebase.authAnonymously", 2, b, !1);
        ag("Firebase.authAnonymously", 3, c, !0);
        Mg(this.k.P, "password", a, c, b);
      };
      U.prototype.authWithPassword = U.prototype.$f;
      U.prototype.re = function(a, b) {
        x("Firebase.createUser", 2, 2, arguments.length);
        ag("Firebase.createUser", 1, a, !1);
        bg("Firebase.createUser", a, "email");
        bg("Firebase.createUser", a, "password");
        A("Firebase.createUser", 2, b, !1);
        this.k.P.re(a, b);
      };
      U.prototype.createUser = U.prototype.re;
      U.prototype.Se = function(a, b) {
        x("Firebase.removeUser", 2, 2, arguments.length);
        ag("Firebase.removeUser", 1, a, !1);
        bg("Firebase.removeUser", a, "email");
        bg("Firebase.removeUser", a, "password");
        A("Firebase.removeUser", 2, b, !1);
        this.k.P.Se(a, b);
      };
      U.prototype.removeUser = U.prototype.Se;
      U.prototype.oe = function(a, b) {
        x("Firebase.changePassword", 2, 2, arguments.length);
        ag("Firebase.changePassword", 1, a, !1);
        bg("Firebase.changePassword", a, "email");
        bg("Firebase.changePassword", a, "oldPassword");
        bg("Firebase.changePassword", a, "newPassword");
        A("Firebase.changePassword", 2, b, !1);
        this.k.P.oe(a, b);
      };
      U.prototype.changePassword = U.prototype.oe;
      U.prototype.ne = function(a, b) {
        x("Firebase.changeEmail", 2, 2, arguments.length);
        ag("Firebase.changeEmail", 1, a, !1);
        bg("Firebase.changeEmail", a, "oldEmail");
        bg("Firebase.changeEmail", a, "newEmail");
        bg("Firebase.changeEmail", a, "password");
        A("Firebase.changeEmail", 2, b, !1);
        this.k.P.ne(a, b);
      };
      U.prototype.changeEmail = U.prototype.ne;
      U.prototype.Ue = function(a, b) {
        x("Firebase.resetPassword", 2, 2, arguments.length);
        ag("Firebase.resetPassword", 1, a, !1);
        bg("Firebase.resetPassword", a, "email");
        A("Firebase.resetPassword", 2, b, !1);
        this.k.P.Ue(a, b);
      };
      U.prototype.resetPassword = U.prototype.Ue;
      U.goOffline = function() {
        x("Firebase.goOffline", 0, 0, arguments.length);
        W.ub().yb();
      };
      U.goOnline = function() {
        x("Firebase.goOnline", 0, 0, arguments.length);
        W.ub().qc();
      };
      function Nc(a, b) {
        J(!b || !0 === a || !1 === a, "Can't turn on custom loggers persistently.");
        !0 === a ? ("undefined" !== typeof console && ("function" === typeof console.log ? Ab = q(console.log, console) : "object" === typeof console.log && (Ab = function(a) {
          console.log(a);
        })), b && P.set("logging_enabled", !0)) : a ? Ab = a : (Ab = null, P.remove("logging_enabled"));
      }
      U.enableLogging = Nc;
      U.ServerValue = {TIMESTAMP: {".sv": "timestamp"}};
      U.SDK_VERSION = "2.2.4";
      U.INTERNAL = V;
      U.Context = W;
      U.TEST_ACCESS = Z;
    })();
  }).call(System.global);
  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});

(function() {
function define(){};  define.amd = {};
System.register("datasources/SharePoint/xml2js", [], false, function(require) {
  return function(config) {
    'use strict';
    var VERSION = "1.1.6";
    config = config || {};
    initConfigDefaults();
    initRequiredPolyfills();
    function initConfigDefaults() {
      if (config.escapeMode === undefined) {
        config.escapeMode = true;
      }
      config.attributePrefix = config.attributePrefix || "_";
      config.arrayAccessForm = config.arrayAccessForm || "none";
      config.emptyNodeForm = config.emptyNodeForm || "text";
      if (config.enableToStringFunc === undefined) {
        config.enableToStringFunc = true;
      }
      config.arrayAccessFormPaths = config.arrayAccessFormPaths || [];
      if (config.skipEmptyTextNodesForObj === undefined) {
        config.skipEmptyTextNodesForObj = true;
      }
      if (config.stripWhitespaces === undefined) {
        config.stripWhitespaces = true;
      }
      config.datetimeAccessFormPaths = config.datetimeAccessFormPaths || [];
    }
    var DOMNodeTypes = {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
      CDATA_SECTION_NODE: 4,
      COMMENT_NODE: 8,
      DOCUMENT_NODE: 9
    };
    function initRequiredPolyfills() {
      function pad(number) {
        var r = String(number);
        if (r.length === 1) {
          r = '0' + r;
        }
        return r;
      }
      if (typeof String.prototype.trim !== 'function') {
        String.prototype.trim = function() {
          return this.replace(/^\s+|^\n+|(\s|\n)+$/g, '');
        };
      }
      if (typeof Date.prototype.toISOString !== 'function') {
        Date.prototype.toISOString = function() {
          return this.getUTCFullYear() + '-' + pad(this.getUTCMonth() + 1) + '-' + pad(this.getUTCDate()) + 'T' + pad(this.getUTCHours()) + ':' + pad(this.getUTCMinutes()) + ':' + pad(this.getUTCSeconds()) + '.' + String((this.getUTCMilliseconds() / 1000).toFixed(3)).slice(2, 5) + 'Z';
        };
      }
    }
    function getNodeLocalName(node) {
      var nodeLocalName = node.localName;
      if (nodeLocalName == null)
        nodeLocalName = node.baseName;
      if (nodeLocalName == null || nodeLocalName == "")
        nodeLocalName = node.nodeName;
      return nodeLocalName;
    }
    function getNodePrefix(node) {
      return node.prefix;
    }
    function escapeXmlChars(str) {
      if (typeof(str) == "string")
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
      else
        return str;
    }
    function unescapeXmlChars(str) {
      return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    }
    function toArrayAccessForm(obj, childName, path) {
      switch (config.arrayAccessForm) {
        case "property":
          if (!(obj[childName] instanceof Array))
            obj[childName + "_asArray"] = [obj[childName]];
          else
            obj[childName + "_asArray"] = obj[childName];
          break;
      }
      if (!(obj[childName] instanceof Array) && config.arrayAccessFormPaths.length > 0) {
        var idx = 0;
        for (; idx < config.arrayAccessFormPaths.length; idx++) {
          var arrayPath = config.arrayAccessFormPaths[idx];
          if (typeof arrayPath === "string") {
            if (arrayPath == path)
              break;
          } else if (arrayPath instanceof RegExp) {
            if (arrayPath.test(path))
              break;
          } else if (typeof arrayPath === "function") {
            if (arrayPath(obj, childName, path))
              break;
          }
        }
        if (idx != config.arrayAccessFormPaths.length) {
          obj[childName] = [obj[childName]];
        }
      }
    }
    function fromXmlDateTime(prop) {
      var bits = prop.split(/[-T:+Z]/g);
      var d = new Date(bits[0], bits[1] - 1, bits[2]);
      var secondBits = bits[5].split("\.");
      d.setHours(bits[3], bits[4], secondBits[0]);
      if (secondBits.length > 1)
        d.setMilliseconds(secondBits[1]);
      if (bits[6] && bits[7]) {
        var offsetMinutes = bits[6] * 60 + Number(bits[7]);
        var sign = /\d\d-\d\d:\d\d$/.test(prop) ? '-' : '+';
        offsetMinutes = 0 + (sign == '-' ? -1 * offsetMinutes : offsetMinutes);
        d.setMinutes(d.getMinutes() - offsetMinutes - d.getTimezoneOffset());
      } else if (prop.indexOf("Z", prop.length - 1) !== -1) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()));
      }
      return d;
    }
    function checkFromXmlDateTimePaths(value, childName, fullPath) {
      if (config.datetimeAccessFormPaths.length > 0) {
        var path = fullPath.split("\.#")[0];
        var idx = 0;
        for (; idx < config.datetimeAccessFormPaths.length; idx++) {
          var dtPath = config.datetimeAccessFormPaths[idx];
          if (typeof dtPath === "string") {
            if (dtPath == path)
              break;
          } else if (dtPath instanceof RegExp) {
            if (dtPath.test(path))
              break;
          } else if (typeof dtPath === "function") {
            if (dtPath(obj, childName, path))
              break;
          }
        }
        if (idx != config.datetimeAccessFormPaths.length) {
          return fromXmlDateTime(value);
        } else
          return value;
      } else
        return value;
    }
    function parseDOMChildren(node, path) {
      if (node.nodeType == DOMNodeTypes.DOCUMENT_NODE) {
        var result = new Object;
        var nodeChildren = node.childNodes;
        for (var cidx = 0; cidx < nodeChildren.length; cidx++) {
          var child = nodeChildren.item(cidx);
          if (child.nodeType == DOMNodeTypes.ELEMENT_NODE) {
            var childName = getNodeLocalName(child);
            result[childName] = parseDOMChildren(child, childName);
          }
        }
        return result;
      } else if (node.nodeType == DOMNodeTypes.ELEMENT_NODE) {
        var result = new Object;
        result.__cnt = 0;
        var nodeChildren = node.childNodes;
        for (var cidx = 0; cidx < nodeChildren.length; cidx++) {
          var child = nodeChildren.item(cidx);
          var childName = getNodeLocalName(child);
          if (child.nodeType != DOMNodeTypes.COMMENT_NODE) {
            result.__cnt++;
            if (result[childName] == null) {
              result[childName] = parseDOMChildren(child, path + "." + childName);
              toArrayAccessForm(result, childName, path + "." + childName);
            } else {
              if (result[childName] != null) {
                if (!(result[childName] instanceof Array)) {
                  result[childName] = [result[childName]];
                  toArrayAccessForm(result, childName, path + "." + childName);
                }
              }
              (result[childName])[result[childName].length] = parseDOMChildren(child, path + "." + childName);
            }
          }
        }
        for (var aidx = 0; aidx < node.attributes.length; aidx++) {
          var attr = node.attributes.item(aidx);
          result.__cnt++;
          result[config.attributePrefix + attr.name] = attr.value;
        }
        var nodePrefix = getNodePrefix(node);
        if (nodePrefix != null && nodePrefix != "") {
          result.__cnt++;
          result.__prefix = nodePrefix;
        }
        if (result["#text"] != null) {
          result.__text = result["#text"];
          if (result.__text instanceof Array) {
            result.__text = result.__text.join("\n");
          }
          if (config.escapeMode)
            result.__text = unescapeXmlChars(result.__text);
          if (config.stripWhitespaces)
            result.__text = result.__text.trim();
          delete result["#text"];
          if (config.arrayAccessForm == "property")
            delete result["#text_asArray"];
          result.__text = checkFromXmlDateTimePaths(result.__text, childName, path + "." + childName);
        }
        if (result["#cdata-section"] != null) {
          result.__cdata = result["#cdata-section"];
          delete result["#cdata-section"];
          if (config.arrayAccessForm == "property")
            delete result["#cdata-section_asArray"];
        }
        if (result.__cnt == 1 && result.__text != null) {
          result = result.__text;
        } else if (result.__cnt == 0 && config.emptyNodeForm == "text") {
          result = '';
        } else if (result.__cnt > 1 && result.__text != null && config.skipEmptyTextNodesForObj) {
          if ((config.stripWhitespaces && result.__text == "") || (result.__text.trim() == "")) {
            delete result.__text;
          }
        }
        delete result.__cnt;
        if (config.enableToStringFunc && (result.__text != null || result.__cdata != null)) {
          result.toString = function() {
            return (this.__text != null ? this.__text : '') + (this.__cdata != null ? this.__cdata : '');
          };
        }
        return result;
      } else if (node.nodeType == DOMNodeTypes.TEXT_NODE || node.nodeType == DOMNodeTypes.CDATA_SECTION_NODE) {
        return node.nodeValue;
      }
    }
    function startTag(jsonObj, element, attrList, closed) {
      var resultStr = "<" + ((jsonObj != null && jsonObj.__prefix != null) ? (jsonObj.__prefix + ":") : "") + element;
      if (attrList != null) {
        for (var aidx = 0; aidx < attrList.length; aidx++) {
          var attrName = attrList[aidx];
          var attrVal = jsonObj[attrName];
          if (config.escapeMode)
            attrVal = escapeXmlChars(attrVal);
          resultStr += " " + attrName.substr(config.attributePrefix.length) + "='" + attrVal + "'";
        }
      }
      if (!closed)
        resultStr += ">";
      else
        resultStr += "/>";
      return resultStr;
    }
    function endTag(jsonObj, elementName) {
      return "</" + (jsonObj.__prefix != null ? (jsonObj.__prefix + ":") : "") + elementName + ">";
    }
    function endsWith(str, suffix) {
      return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }
    function jsonXmlSpecialElem(jsonObj, jsonObjField) {
      if ((config.arrayAccessForm == "property" && endsWith(jsonObjField.toString(), ("_asArray"))) || jsonObjField.toString().indexOf(config.attributePrefix) == 0 || jsonObjField.toString().indexOf("__") == 0 || (jsonObj[jsonObjField] instanceof Function))
        return true;
      else
        return false;
    }
    function jsonXmlElemCount(jsonObj) {
      var elementsCnt = 0;
      if (jsonObj instanceof Object) {
        for (var it in jsonObj) {
          if (jsonXmlSpecialElem(jsonObj, it))
            continue;
          elementsCnt++;
        }
      }
      return elementsCnt;
    }
    function parseJSONAttributes(jsonObj) {
      var attrList = [];
      if (jsonObj instanceof Object) {
        for (var ait in jsonObj) {
          if (ait.toString().indexOf("__") == -1 && ait.toString().indexOf(config.attributePrefix) == 0) {
            attrList.push(ait);
          }
        }
      }
      return attrList;
    }
    function parseJSONTextAttrs(jsonTxtObj) {
      var result = "";
      if (jsonTxtObj.__cdata != null) {
        result += "<![CDATA[" + jsonTxtObj.__cdata + "]]>";
      }
      if (jsonTxtObj.__text != null) {
        if (config.escapeMode)
          result += escapeXmlChars(jsonTxtObj.__text);
        else
          result += jsonTxtObj.__text;
      }
      return result;
    }
    function parseJSONTextObject(jsonTxtObj) {
      var result = "";
      if (jsonTxtObj instanceof Object) {
        result += parseJSONTextAttrs(jsonTxtObj);
      } else if (jsonTxtObj != null) {
        if (config.escapeMode)
          result += escapeXmlChars(jsonTxtObj);
        else
          result += jsonTxtObj;
      }
      return result;
    }
    function parseJSONArray(jsonArrRoot, jsonArrObj, attrList) {
      var result = "";
      if (jsonArrRoot.length == 0) {
        result += startTag(jsonArrRoot, jsonArrObj, attrList, true);
      } else {
        for (var arIdx = 0; arIdx < jsonArrRoot.length; arIdx++) {
          result += startTag(jsonArrRoot[arIdx], jsonArrObj, parseJSONAttributes(jsonArrRoot[arIdx]), false);
          result += parseJSONObject(jsonArrRoot[arIdx]);
          result += endTag(jsonArrRoot[arIdx], jsonArrObj);
        }
      }
      return result;
    }
    function parseJSONObject(jsonObj) {
      var result = "";
      var elementsCnt = jsonXmlElemCount(jsonObj);
      if (elementsCnt > 0) {
        for (var it in jsonObj) {
          if (jsonXmlSpecialElem(jsonObj, it))
            continue;
          var subObj = jsonObj[it];
          var attrList = parseJSONAttributes(subObj);
          if (subObj == null || subObj == undefined) {
            result += startTag(subObj, it, attrList, true);
          } else if (subObj instanceof Object) {
            if (subObj instanceof Array) {
              result += parseJSONArray(subObj, it, attrList);
            } else if (subObj instanceof Date) {
              result += startTag(subObj, it, attrList, false);
              result += subObj.toISOString();
              result += endTag(subObj, it);
            } else {
              var subObjElementsCnt = jsonXmlElemCount(subObj);
              if (subObjElementsCnt > 0 || subObj.__text != null || subObj.__cdata != null) {
                result += startTag(subObj, it, attrList, false);
                result += parseJSONObject(subObj);
                result += endTag(subObj, it);
              } else {
                result += startTag(subObj, it, attrList, true);
              }
            }
          } else {
            result += startTag(subObj, it, attrList, false);
            result += parseJSONTextObject(subObj);
            result += endTag(subObj, it);
          }
        }
      }
      result += parseJSONTextObject(jsonObj);
      return result;
    }
    this.parseXmlString = function(xmlDocStr) {
      var isIEParser = window.ActiveXObject || "ActiveXObject" in window;
      if (xmlDocStr === undefined) {
        return null;
      }
      var xmlDoc;
      if (window.DOMParser) {
        var parser = new window.DOMParser();
        var parsererrorNS = null;
        if (!isIEParser) {
          try {
            parsererrorNS = parser.parseFromString("INVALID", "text/xml").childNodes[0].namespaceURI;
          } catch (err) {
            parsererrorNS = null;
          }
        }
        try {
          xmlDoc = parser.parseFromString(xmlDocStr, "text/xml");
          if (parsererrorNS != null && xmlDoc.getElementsByTagNameNS(parsererrorNS, "parsererror").length > 0) {
            xmlDoc = null;
          }
        } catch (err) {
          xmlDoc = null;
        }
      } else {
        if (xmlDocStr.indexOf("<?") == 0) {
          xmlDocStr = xmlDocStr.substr(xmlDocStr.indexOf("?>") + 2);
        }
        xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = "false";
        xmlDoc.loadXML(xmlDocStr);
      }
      return xmlDoc;
    };
    this.asArray = function(prop) {
      if (prop instanceof Array)
        return prop;
      else
        return [prop];
    };
    this.toXmlDateTime = function(dt) {
      if (dt instanceof Date)
        return dt.toISOString();
      else if (typeof(dt) === 'number')
        return new Date(dt).toISOString();
      else
        return null;
    };
    this.asDateTime = function(prop) {
      if (typeof(prop) == "string") {
        return fromXmlDateTime(prop);
      } else
        return prop;
    };
    this.xml2json = function(xmlDoc) {
      return parseDOMChildren(xmlDoc);
    };
    this.xml_str2json = function(xmlDocStr) {
      var xmlDoc = this.parseXmlString(xmlDocStr);
      if (xmlDoc != null)
        return this.xml2json(xmlDoc);
      else
        return null;
    };
    this.json2xml_str = function(jsonObj) {
      return parseJSONObject(jsonObj);
    };
    this.json2xml = function(jsonObj) {
      var xmlDocStr = this.json2xml_str(jsonObj);
      return this.parseXmlString(xmlDocStr);
    };
    this.getVersion = function() {
      return VERSION;
    };
  };
});
})();
System.register("npm:process@0.10.1", ["npm:process@0.10.1/browser"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:process@0.10.1/browser");
  global.define = __define;
  return module.exports;
});

System.register("github:firebase/firebase-bower@2.2.4", ["github:firebase/firebase-bower@2.2.4/firebase"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:firebase/firebase-bower@2.2.4/firebase");
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-process@0.1.1/index", ["npm:process@0.10.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = System._nodeRequire ? process : require("npm:process@0.10.1");
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-process@0.1.1", ["github:jspm/nodelibs-process@0.1.1/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:jspm/nodelibs-process@0.1.1/index");
  global.define = __define;
  return module.exports;
});

System.register("npm:lodash@3.8.0/index", ["github:jspm/nodelibs-process@0.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function(process) {
    ;
    (function() {
      var undefined;
      var VERSION = '3.8.0';
      var BIND_FLAG = 1,
          BIND_KEY_FLAG = 2,
          CURRY_BOUND_FLAG = 4,
          CURRY_FLAG = 8,
          CURRY_RIGHT_FLAG = 16,
          PARTIAL_FLAG = 32,
          PARTIAL_RIGHT_FLAG = 64,
          ARY_FLAG = 128,
          REARG_FLAG = 256;
      var DEFAULT_TRUNC_LENGTH = 30,
          DEFAULT_TRUNC_OMISSION = '...';
      var HOT_COUNT = 150,
          HOT_SPAN = 16;
      var LAZY_DROP_WHILE_FLAG = 0,
          LAZY_FILTER_FLAG = 1,
          LAZY_MAP_FLAG = 2;
      var FUNC_ERROR_TEXT = 'Expected a function';
      var PLACEHOLDER = '__lodash_placeholder__';
      var argsTag = '[object Arguments]',
          arrayTag = '[object Array]',
          boolTag = '[object Boolean]',
          dateTag = '[object Date]',
          errorTag = '[object Error]',
          funcTag = '[object Function]',
          mapTag = '[object Map]',
          numberTag = '[object Number]',
          objectTag = '[object Object]',
          regexpTag = '[object RegExp]',
          setTag = '[object Set]',
          stringTag = '[object String]',
          weakMapTag = '[object WeakMap]';
      var arrayBufferTag = '[object ArrayBuffer]',
          float32Tag = '[object Float32Array]',
          float64Tag = '[object Float64Array]',
          int8Tag = '[object Int8Array]',
          int16Tag = '[object Int16Array]',
          int32Tag = '[object Int32Array]',
          uint8Tag = '[object Uint8Array]',
          uint8ClampedTag = '[object Uint8ClampedArray]',
          uint16Tag = '[object Uint16Array]',
          uint32Tag = '[object Uint32Array]';
      var reEmptyStringLeading = /\b__p \+= '';/g,
          reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
          reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;
      var reEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/g,
          reUnescapedHtml = /[&<>"'`]/g,
          reHasEscapedHtml = RegExp(reEscapedHtml.source),
          reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
      var reEscape = /<%-([\s\S]+?)%>/g,
          reEvaluate = /<%([\s\S]+?)%>/g,
          reInterpolate = /<%=([\s\S]+?)%>/g;
      var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
          reIsPlainProp = /^\w*$/,
          rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;
      var reRegExpChars = /[.*+?^${}()|[\]\/\\]/g,
          reHasRegExpChars = RegExp(reRegExpChars.source);
      var reComboMark = /[\u0300-\u036f\ufe20-\ufe23]/g;
      var reEscapeChar = /\\(\\)?/g;
      var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;
      var reFlags = /\w*$/;
      var reHasHexPrefix = /^0[xX]/;
      var reIsHostCtor = /^\[object .+?Constructor\]$/;
      var reLatin1 = /[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g;
      var reNoMatch = /($^)/;
      var reUnescapedString = /['\n\r\u2028\u2029\\]/g;
      var reWords = (function() {
        var upper = '[A-Z\\xc0-\\xd6\\xd8-\\xde]',
            lower = '[a-z\\xdf-\\xf6\\xf8-\\xff]+';
        return RegExp(upper + '+(?=' + upper + lower + ')|' + upper + '?' + lower + '|' + upper + '+|[0-9]+', 'g');
      }());
      var whitespace = (' \t\x0b\f\xa0\ufeff' + '\n\r\u2028\u2029' + '\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000');
      var contextProps = ['Array', 'ArrayBuffer', 'Date', 'Error', 'Float32Array', 'Float64Array', 'Function', 'Int8Array', 'Int16Array', 'Int32Array', 'Math', 'Number', 'Object', 'RegExp', 'Set', 'String', '_', 'clearTimeout', 'document', 'isFinite', 'parseInt', 'setTimeout', 'TypeError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'WeakMap', 'window'];
      var templateCounter = -1;
      var typedArrayTags = {};
      typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
      typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
      var cloneableTags = {};
      cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[stringTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
      cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[mapTag] = cloneableTags[setTag] = cloneableTags[weakMapTag] = false;
      var debounceOptions = {
        'leading': false,
        'maxWait': 0,
        'trailing': false
      };
      var deburredLetters = {
        '\xc0': 'A',
        '\xc1': 'A',
        '\xc2': 'A',
        '\xc3': 'A',
        '\xc4': 'A',
        '\xc5': 'A',
        '\xe0': 'a',
        '\xe1': 'a',
        '\xe2': 'a',
        '\xe3': 'a',
        '\xe4': 'a',
        '\xe5': 'a',
        '\xc7': 'C',
        '\xe7': 'c',
        '\xd0': 'D',
        '\xf0': 'd',
        '\xc8': 'E',
        '\xc9': 'E',
        '\xca': 'E',
        '\xcb': 'E',
        '\xe8': 'e',
        '\xe9': 'e',
        '\xea': 'e',
        '\xeb': 'e',
        '\xcC': 'I',
        '\xcd': 'I',
        '\xce': 'I',
        '\xcf': 'I',
        '\xeC': 'i',
        '\xed': 'i',
        '\xee': 'i',
        '\xef': 'i',
        '\xd1': 'N',
        '\xf1': 'n',
        '\xd2': 'O',
        '\xd3': 'O',
        '\xd4': 'O',
        '\xd5': 'O',
        '\xd6': 'O',
        '\xd8': 'O',
        '\xf2': 'o',
        '\xf3': 'o',
        '\xf4': 'o',
        '\xf5': 'o',
        '\xf6': 'o',
        '\xf8': 'o',
        '\xd9': 'U',
        '\xda': 'U',
        '\xdb': 'U',
        '\xdc': 'U',
        '\xf9': 'u',
        '\xfa': 'u',
        '\xfb': 'u',
        '\xfc': 'u',
        '\xdd': 'Y',
        '\xfd': 'y',
        '\xff': 'y',
        '\xc6': 'Ae',
        '\xe6': 'ae',
        '\xde': 'Th',
        '\xfe': 'th',
        '\xdf': 'ss'
      };
      var htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;'
      };
      var htmlUnescapes = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#96;': '`'
      };
      var objectTypes = {
        'function': true,
        'object': true
      };
      var stringEscapes = {
        '\\': '\\',
        "'": "'",
        '\n': 'n',
        '\r': 'r',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
      };
      var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;
      var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;
      var freeGlobal = freeExports && freeModule && typeof global == 'object' && global && global.Object && global;
      var freeSelf = objectTypes[typeof self] && self && self.Object && self;
      var freeWindow = objectTypes[typeof window] && window && window.Object && window;
      var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;
      var root = freeGlobal || ((freeWindow !== (this && this.window)) && freeWindow) || freeSelf || this;
      function baseCompareAscending(value, other) {
        if (value !== other) {
          var valIsReflexive = value === value,
              othIsReflexive = other === other;
          if (value > other || !valIsReflexive || (value === undefined && othIsReflexive)) {
            return 1;
          }
          if (value < other || !othIsReflexive || (other === undefined && valIsReflexive)) {
            return -1;
          }
        }
        return 0;
      }
      function baseFindIndex(array, predicate, fromRight) {
        var length = array.length,
            index = fromRight ? length : -1;
        while ((fromRight ? index-- : ++index < length)) {
          if (predicate(array[index], index, array)) {
            return index;
          }
        }
        return -1;
      }
      function baseIndexOf(array, value, fromIndex) {
        if (value !== value) {
          return indexOfNaN(array, fromIndex);
        }
        var index = fromIndex - 1,
            length = array.length;
        while (++index < length) {
          if (array[index] === value) {
            return index;
          }
        }
        return -1;
      }
      function baseIsFunction(value) {
        return typeof value == 'function' || false;
      }
      function baseToString(value) {
        if (typeof value == 'string') {
          return value;
        }
        return value == null ? '' : (value + '');
      }
      function charAtCallback(string) {
        return string.charCodeAt(0);
      }
      function charsLeftIndex(string, chars) {
        var index = -1,
            length = string.length;
        while (++index < length && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function charsRightIndex(string, chars) {
        var index = string.length;
        while (index-- && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function compareAscending(object, other) {
        return baseCompareAscending(object.criteria, other.criteria) || (object.index - other.index);
      }
      function compareMultiple(object, other, orders) {
        var index = -1,
            objCriteria = object.criteria,
            othCriteria = other.criteria,
            length = objCriteria.length,
            ordersLength = orders.length;
        while (++index < length) {
          var result = baseCompareAscending(objCriteria[index], othCriteria[index]);
          if (result) {
            if (index >= ordersLength) {
              return result;
            }
            return result * (orders[index] ? 1 : -1);
          }
        }
        return object.index - other.index;
      }
      function deburrLetter(letter) {
        return deburredLetters[letter];
      }
      function escapeHtmlChar(chr) {
        return htmlEscapes[chr];
      }
      function escapeStringChar(chr) {
        return '\\' + stringEscapes[chr];
      }
      function indexOfNaN(array, fromIndex, fromRight) {
        var length = array.length,
            index = fromIndex + (fromRight ? 0 : -1);
        while ((fromRight ? index-- : ++index < length)) {
          var other = array[index];
          if (other !== other) {
            return index;
          }
        }
        return -1;
      }
      function isObjectLike(value) {
        return !!value && typeof value == 'object';
      }
      function isSpace(charCode) {
        return ((charCode <= 160 && (charCode >= 9 && charCode <= 13) || charCode == 32 || charCode == 160) || charCode == 5760 || charCode == 6158 || (charCode >= 8192 && (charCode <= 8202 || charCode == 8232 || charCode == 8233 || charCode == 8239 || charCode == 8287 || charCode == 12288 || charCode == 65279)));
      }
      function replaceHolders(array, placeholder) {
        var index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          if (array[index] === placeholder) {
            array[index] = PLACEHOLDER;
            result[++resIndex] = index;
          }
        }
        return result;
      }
      function sortedUniq(array, iteratee) {
        var seen,
            index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          var value = array[index],
              computed = iteratee ? iteratee(value, index, array) : value;
          if (!index || seen !== computed) {
            seen = computed;
            result[++resIndex] = value;
          }
        }
        return result;
      }
      function trimmedLeftIndex(string) {
        var index = -1,
            length = string.length;
        while (++index < length && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function trimmedRightIndex(string) {
        var index = string.length;
        while (index-- && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function unescapeHtmlChar(chr) {
        return htmlUnescapes[chr];
      }
      function runInContext(context) {
        context = context ? _.defaults(root.Object(), context, _.pick(root, contextProps)) : root;
        var Array = context.Array,
            Date = context.Date,
            Error = context.Error,
            Function = context.Function,
            Math = context.Math,
            Number = context.Number,
            Object = context.Object,
            RegExp = context.RegExp,
            String = context.String,
            TypeError = context.TypeError;
        var arrayProto = Array.prototype,
            objectProto = Object.prototype,
            stringProto = String.prototype;
        var document = (document = context.window) && document.document;
        var fnToString = Function.prototype.toString;
        var hasOwnProperty = objectProto.hasOwnProperty;
        var idCounter = 0;
        var objToString = objectProto.toString;
        var oldDash = context._;
        var reIsNative = RegExp('^' + escapeRegExp(objToString).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');
        var ArrayBuffer = isNative(ArrayBuffer = context.ArrayBuffer) && ArrayBuffer,
            bufferSlice = isNative(bufferSlice = ArrayBuffer && new ArrayBuffer(0).slice) && bufferSlice,
            ceil = Math.ceil,
            clearTimeout = context.clearTimeout,
            floor = Math.floor,
            getOwnPropertySymbols = isNative(getOwnPropertySymbols = Object.getOwnPropertySymbols) && getOwnPropertySymbols,
            getPrototypeOf = isNative(getPrototypeOf = Object.getPrototypeOf) && getPrototypeOf,
            push = arrayProto.push,
            preventExtensions = isNative(preventExtensions = Object.preventExtensions) && preventExtensions,
            propertyIsEnumerable = objectProto.propertyIsEnumerable,
            Set = isNative(Set = context.Set) && Set,
            setTimeout = context.setTimeout,
            splice = arrayProto.splice,
            Uint8Array = isNative(Uint8Array = context.Uint8Array) && Uint8Array,
            WeakMap = isNative(WeakMap = context.WeakMap) && WeakMap;
        var Float64Array = (function() {
          try {
            var func = isNative(func = context.Float64Array) && func,
                result = new func(new ArrayBuffer(10), 0, 1) && func;
          } catch (e) {}
          return result;
        }());
        var nativeAssign = (function() {
          var func = preventExtensions && isNative(func = Object.assign) && func;
          try {
            if (func) {
              var object = preventExtensions({'1': 0});
              object[0] = 1;
            }
          } catch (e) {
            try {
              func(object, 'xo');
            } catch (e) {}
            return !object[1] && func;
          }
          return false;
        }());
        var nativeIsArray = isNative(nativeIsArray = Array.isArray) && nativeIsArray,
            nativeCreate = isNative(nativeCreate = Object.create) && nativeCreate,
            nativeIsFinite = context.isFinite,
            nativeKeys = isNative(nativeKeys = Object.keys) && nativeKeys,
            nativeMax = Math.max,
            nativeMin = Math.min,
            nativeNow = isNative(nativeNow = Date.now) && nativeNow,
            nativeNumIsFinite = isNative(nativeNumIsFinite = Number.isFinite) && nativeNumIsFinite,
            nativeParseInt = context.parseInt,
            nativeRandom = Math.random;
        var NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY,
            POSITIVE_INFINITY = Number.POSITIVE_INFINITY;
        var MAX_ARRAY_LENGTH = Math.pow(2, 32) - 1,
            MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1,
            HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;
        var FLOAT64_BYTES_PER_ELEMENT = Float64Array ? Float64Array.BYTES_PER_ELEMENT : 0;
        var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
        var metaMap = WeakMap && new WeakMap;
        var realNames = {};
        function lodash(value) {
          if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
            if (value instanceof LodashWrapper) {
              return value;
            }
            if (hasOwnProperty.call(value, '__chain__') && hasOwnProperty.call(value, '__wrapped__')) {
              return wrapperClone(value);
            }
          }
          return new LodashWrapper(value);
        }
        function baseLodash() {}
        function LodashWrapper(value, chainAll, actions) {
          this.__wrapped__ = value;
          this.__actions__ = actions || [];
          this.__chain__ = !!chainAll;
        }
        var support = lodash.support = {};
        (function(x) {
          var Ctor = function() {
            this.x = x;
          },
              args = arguments,
              object = {
                '0': x,
                'length': x
              },
              props = [];
          Ctor.prototype = {
            'valueOf': x,
            'y': x
          };
          for (var key in new Ctor) {
            props.push(key);
          }
          support.funcDecomp = /\bthis\b/.test(function() {
            return this;
          });
          support.funcNames = typeof Function.name == 'string';
          try {
            support.dom = document.createDocumentFragment().nodeType === 11;
          } catch (e) {
            support.dom = false;
          }
          try {
            support.nonEnumArgs = !propertyIsEnumerable.call(args, 1);
          } catch (e) {
            support.nonEnumArgs = true;
          }
        }(1, 0));
        lodash.templateSettings = {
          'escape': reEscape,
          'evaluate': reEvaluate,
          'interpolate': reInterpolate,
          'variable': '',
          'imports': {'_': lodash}
        };
        function LazyWrapper(value) {
          this.__wrapped__ = value;
          this.__actions__ = null;
          this.__dir__ = 1;
          this.__dropCount__ = 0;
          this.__filtered__ = false;
          this.__iteratees__ = null;
          this.__takeCount__ = POSITIVE_INFINITY;
          this.__views__ = null;
        }
        function lazyClone() {
          var actions = this.__actions__,
              iteratees = this.__iteratees__,
              views = this.__views__,
              result = new LazyWrapper(this.__wrapped__);
          result.__actions__ = actions ? arrayCopy(actions) : null;
          result.__dir__ = this.__dir__;
          result.__filtered__ = this.__filtered__;
          result.__iteratees__ = iteratees ? arrayCopy(iteratees) : null;
          result.__takeCount__ = this.__takeCount__;
          result.__views__ = views ? arrayCopy(views) : null;
          return result;
        }
        function lazyReverse() {
          if (this.__filtered__) {
            var result = new LazyWrapper(this);
            result.__dir__ = -1;
            result.__filtered__ = true;
          } else {
            result = this.clone();
            result.__dir__ *= -1;
          }
          return result;
        }
        function lazyValue() {
          var array = this.__wrapped__.value();
          if (!isArray(array)) {
            return baseWrapperValue(array, this.__actions__);
          }
          var dir = this.__dir__,
              isRight = dir < 0,
              view = getView(0, array.length, this.__views__),
              start = view.start,
              end = view.end,
              length = end - start,
              index = isRight ? end : (start - 1),
              takeCount = nativeMin(length, this.__takeCount__),
              iteratees = this.__iteratees__,
              iterLength = iteratees ? iteratees.length : 0,
              resIndex = 0,
              result = [];
          outer: while (length-- && resIndex < takeCount) {
            index += dir;
            var iterIndex = -1,
                value = array[index];
            while (++iterIndex < iterLength) {
              var data = iteratees[iterIndex],
                  iteratee = data.iteratee,
                  type = data.type;
              if (type == LAZY_DROP_WHILE_FLAG) {
                if (data.done && (isRight ? (index > data.index) : (index < data.index))) {
                  data.count = 0;
                  data.done = false;
                }
                data.index = index;
                if (!data.done) {
                  var limit = data.limit;
                  if (!(data.done = limit > -1 ? (data.count++ >= limit) : !iteratee(value))) {
                    continue outer;
                  }
                }
              } else {
                var computed = iteratee(value);
                if (type == LAZY_MAP_FLAG) {
                  value = computed;
                } else if (!computed) {
                  if (type == LAZY_FILTER_FLAG) {
                    continue outer;
                  } else {
                    break outer;
                  }
                }
              }
            }
            result[resIndex++] = value;
          }
          return result;
        }
        function MapCache() {
          this.__data__ = {};
        }
        function mapDelete(key) {
          return this.has(key) && delete this.__data__[key];
        }
        function mapGet(key) {
          return key == '__proto__' ? undefined : this.__data__[key];
        }
        function mapHas(key) {
          return key != '__proto__' && hasOwnProperty.call(this.__data__, key);
        }
        function mapSet(key, value) {
          if (key != '__proto__') {
            this.__data__[key] = value;
          }
          return this;
        }
        function SetCache(values) {
          var length = values ? values.length : 0;
          this.data = {
            'hash': nativeCreate(null),
            'set': new Set
          };
          while (length--) {
            this.push(values[length]);
          }
        }
        function cacheIndexOf(cache, value) {
          var data = cache.data,
              result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];
          return result ? 0 : -1;
        }
        function cachePush(value) {
          var data = this.data;
          if (typeof value == 'string' || isObject(value)) {
            data.set.add(value);
          } else {
            data.hash[value] = true;
          }
        }
        function arrayCopy(source, array) {
          var index = -1,
              length = source.length;
          array || (array = Array(length));
          while (++index < length) {
            array[index] = source[index];
          }
          return array;
        }
        function arrayEach(array, iteratee) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (iteratee(array[index], index, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEachRight(array, iteratee) {
          var length = array.length;
          while (length--) {
            if (iteratee(array[length], length, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEvery(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (!predicate(array[index], index, array)) {
              return false;
            }
          }
          return true;
        }
        function arrayFilter(array, predicate) {
          var index = -1,
              length = array.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        function arrayMap(array, iteratee) {
          var index = -1,
              length = array.length,
              result = Array(length);
          while (++index < length) {
            result[index] = iteratee(array[index], index, array);
          }
          return result;
        }
        function arrayMax(array) {
          var index = -1,
              length = array.length,
              result = NEGATIVE_INFINITY;
          while (++index < length) {
            var value = array[index];
            if (value > result) {
              result = value;
            }
          }
          return result;
        }
        function arrayMin(array) {
          var index = -1,
              length = array.length,
              result = POSITIVE_INFINITY;
          while (++index < length) {
            var value = array[index];
            if (value < result) {
              result = value;
            }
          }
          return result;
        }
        function arrayReduce(array, iteratee, accumulator, initFromArray) {
          var index = -1,
              length = array.length;
          if (initFromArray && length) {
            accumulator = array[++index];
          }
          while (++index < length) {
            accumulator = iteratee(accumulator, array[index], index, array);
          }
          return accumulator;
        }
        function arrayReduceRight(array, iteratee, accumulator, initFromArray) {
          var length = array.length;
          if (initFromArray && length) {
            accumulator = array[--length];
          }
          while (length--) {
            accumulator = iteratee(accumulator, array[length], length, array);
          }
          return accumulator;
        }
        function arraySome(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (predicate(array[index], index, array)) {
              return true;
            }
          }
          return false;
        }
        function arraySum(array) {
          var length = array.length,
              result = 0;
          while (length--) {
            result += +array[length] || 0;
          }
          return result;
        }
        function assignDefaults(objectValue, sourceValue) {
          return objectValue === undefined ? sourceValue : objectValue;
        }
        function assignOwnDefaults(objectValue, sourceValue, key, object) {
          return (objectValue === undefined || !hasOwnProperty.call(object, key)) ? sourceValue : objectValue;
        }
        function assignWith(object, source, customizer) {
          var props = keys(source);
          push.apply(props, getSymbols(source));
          var index = -1,
              length = props.length;
          while (++index < length) {
            var key = props[index],
                value = object[key],
                result = customizer(value, source[key], key, object, source);
            if ((result === result ? (result !== value) : (value === value)) || (value === undefined && !(key in object))) {
              object[key] = result;
            }
          }
          return object;
        }
        var baseAssign = nativeAssign || function(object, source) {
          return source == null ? object : baseCopy(source, getSymbols(source), baseCopy(source, keys(source), object));
        };
        function baseAt(collection, props) {
          var index = -1,
              isNil = collection == null,
              isArr = !isNil && isArrayLike(collection),
              length = isArr && collection.length,
              propsLength = props.length,
              result = Array(propsLength);
          while (++index < propsLength) {
            var key = props[index];
            if (isArr) {
              result[index] = isIndex(key, length) ? collection[key] : undefined;
            } else {
              result[index] = isNil ? undefined : collection[key];
            }
          }
          return result;
        }
        function baseCopy(source, props, object) {
          object || (object = {});
          var index = -1,
              length = props.length;
          while (++index < length) {
            var key = props[index];
            object[key] = source[key];
          }
          return object;
        }
        function baseCallback(func, thisArg, argCount) {
          var type = typeof func;
          if (type == 'function') {
            return thisArg === undefined ? func : bindCallback(func, thisArg, argCount);
          }
          if (func == null) {
            return identity;
          }
          if (type == 'object') {
            return baseMatches(func);
          }
          return thisArg === undefined ? property(func) : baseMatchesProperty(func, thisArg);
        }
        function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
          var result;
          if (customizer) {
            result = object ? customizer(value, key, object) : customizer(value);
          }
          if (result !== undefined) {
            return result;
          }
          if (!isObject(value)) {
            return value;
          }
          var isArr = isArray(value);
          if (isArr) {
            result = initCloneArray(value);
            if (!isDeep) {
              return arrayCopy(value, result);
            }
          } else {
            var tag = objToString.call(value),
                isFunc = tag == funcTag;
            if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
              result = initCloneObject(isFunc ? {} : value);
              if (!isDeep) {
                return baseAssign(result, value);
              }
            } else {
              return cloneableTags[tag] ? initCloneByTag(value, tag, isDeep) : (object ? value : {});
            }
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == value) {
              return stackB[length];
            }
          }
          stackA.push(value);
          stackB.push(result);
          (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
            result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
          });
          return result;
        }
        var baseCreate = (function() {
          function Object() {}
          return function(prototype) {
            if (isObject(prototype)) {
              Object.prototype = prototype;
              var result = new Object;
              Object.prototype = null;
            }
            return result || context.Object();
          };
        }());
        function baseDelay(func, wait, args) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return setTimeout(function() {
            func.apply(undefined, args);
          }, wait);
        }
        function baseDifference(array, values) {
          var length = array ? array.length : 0,
              result = [];
          if (!length) {
            return result;
          }
          var index = -1,
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              cache = (isCommon && values.length >= 200) ? createCache(values) : null,
              valuesLength = values.length;
          if (cache) {
            indexOf = cacheIndexOf;
            isCommon = false;
            values = cache;
          }
          outer: while (++index < length) {
            var value = array[index];
            if (isCommon && value === value) {
              var valuesIndex = valuesLength;
              while (valuesIndex--) {
                if (values[valuesIndex] === value) {
                  continue outer;
                }
              }
              result.push(value);
            } else if (indexOf(values, value, 0) < 0) {
              result.push(value);
            }
          }
          return result;
        }
        var baseEach = createBaseEach(baseForOwn);
        var baseEachRight = createBaseEach(baseForOwnRight, true);
        function baseEvery(collection, predicate) {
          var result = true;
          baseEach(collection, function(value, index, collection) {
            result = !!predicate(value, index, collection);
            return result;
          });
          return result;
        }
        function baseFill(array, value, start, end) {
          var length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : (end >>> 0);
          start >>>= 0;
          while (start < length) {
            array[start++] = value;
          }
          return array;
        }
        function baseFilter(collection, predicate) {
          var result = [];
          baseEach(collection, function(value, index, collection) {
            if (predicate(value, index, collection)) {
              result.push(value);
            }
          });
          return result;
        }
        function baseFind(collection, predicate, eachFunc, retKey) {
          var result;
          eachFunc(collection, function(value, key, collection) {
            if (predicate(value, key, collection)) {
              result = retKey ? key : value;
              return false;
            }
          });
          return result;
        }
        function baseFlatten(array, isDeep, isStrict) {
          var index = -1,
              length = array.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (isObjectLike(value) && isArrayLike(value) && (isStrict || isArray(value) || isArguments(value))) {
              if (isDeep) {
                value = baseFlatten(value, isDeep, isStrict);
              }
              var valIndex = -1,
                  valLength = value.length;
              while (++valIndex < valLength) {
                result[++resIndex] = value[valIndex];
              }
            } else if (!isStrict) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        var baseFor = createBaseFor();
        var baseForRight = createBaseFor(true);
        function baseForIn(object, iteratee) {
          return baseFor(object, iteratee, keysIn);
        }
        function baseForOwn(object, iteratee) {
          return baseFor(object, iteratee, keys);
        }
        function baseForOwnRight(object, iteratee) {
          return baseForRight(object, iteratee, keys);
        }
        function baseFunctions(object, props) {
          var index = -1,
              length = props.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var key = props[index];
            if (isFunction(object[key])) {
              result[++resIndex] = key;
            }
          }
          return result;
        }
        function baseGet(object, path, pathKey) {
          if (object == null) {
            return ;
          }
          if (pathKey !== undefined && pathKey in toObject(object)) {
            path = [pathKey];
          }
          var index = -1,
              length = path.length;
          while (object != null && ++index < length) {
            object = object[path[index]];
          }
          return (index && index == length) ? object : undefined;
        }
        function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
          if (value === other) {
            return true;
          }
          var valType = typeof value,
              othType = typeof other;
          if ((valType != 'function' && valType != 'object' && othType != 'function' && othType != 'object') || value == null || other == null) {
            return value !== value && other !== other;
          }
          return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
        }
        function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objIsArr = isArray(object),
              othIsArr = isArray(other),
              objTag = arrayTag,
              othTag = arrayTag;
          if (!objIsArr) {
            objTag = objToString.call(object);
            if (objTag == argsTag) {
              objTag = objectTag;
            } else if (objTag != objectTag) {
              objIsArr = isTypedArray(object);
            }
          }
          if (!othIsArr) {
            othTag = objToString.call(other);
            if (othTag == argsTag) {
              othTag = objectTag;
            } else if (othTag != objectTag) {
              othIsArr = isTypedArray(other);
            }
          }
          var objIsObj = objTag == objectTag,
              othIsObj = othTag == objectTag,
              isSameTag = objTag == othTag;
          if (isSameTag && !(objIsArr || objIsObj)) {
            return equalByTag(object, other, objTag);
          }
          if (!isLoose) {
            var valWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
                othWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');
            if (valWrapped || othWrapped) {
              return equalFunc(valWrapped ? object.value() : object, othWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
            }
          }
          if (!isSameTag) {
            return false;
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == object) {
              return stackB[length] == other;
            }
          }
          stackA.push(object);
          stackB.push(other);
          var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);
          stackA.pop();
          stackB.pop();
          return result;
        }
        function baseIsMatch(object, props, values, strictCompareFlags, customizer) {
          var index = -1,
              length = props.length,
              noCustomizer = !customizer;
          while (++index < length) {
            if ((noCustomizer && strictCompareFlags[index]) ? values[index] !== object[props[index]] : !(props[index] in object)) {
              return false;
            }
          }
          index = -1;
          while (++index < length) {
            var key = props[index],
                objValue = object[key],
                srcValue = values[index];
            if (noCustomizer && strictCompareFlags[index]) {
              var result = objValue !== undefined || (key in object);
            } else {
              result = customizer ? customizer(objValue, srcValue, key) : undefined;
              if (result === undefined) {
                result = baseIsEqual(srcValue, objValue, customizer, true);
              }
            }
            if (!result) {
              return false;
            }
          }
          return true;
        }
        function baseMap(collection, iteratee) {
          var index = -1,
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value, key, collection) {
            result[++index] = iteratee(value, key, collection);
          });
          return result;
        }
        function baseMatches(source) {
          var props = keys(source),
              length = props.length;
          if (!length) {
            return constant(true);
          }
          if (length == 1) {
            var key = props[0],
                value = source[key];
            if (isStrictComparable(value)) {
              return function(object) {
                if (object == null) {
                  return false;
                }
                return object[key] === value && (value !== undefined || (key in toObject(object)));
              };
            }
          }
          var values = Array(length),
              strictCompareFlags = Array(length);
          while (length--) {
            value = source[props[length]];
            values[length] = value;
            strictCompareFlags[length] = isStrictComparable(value);
          }
          return function(object) {
            return object != null && baseIsMatch(toObject(object), props, values, strictCompareFlags);
          };
        }
        function baseMatchesProperty(path, value) {
          var isArr = isArray(path),
              isCommon = isKey(path) && isStrictComparable(value),
              pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            if (object == null) {
              return false;
            }
            var key = pathKey;
            object = toObject(object);
            if ((isArr || !isCommon) && !(key in object)) {
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              if (object == null) {
                return false;
              }
              key = last(path);
              object = toObject(object);
            }
            return object[key] === value ? (value !== undefined || (key in object)) : baseIsEqual(value, object[key], null, true);
          };
        }
        function baseMerge(object, source, customizer, stackA, stackB) {
          if (!isObject(object)) {
            return object;
          }
          var isSrcArr = isArrayLike(source) && (isArray(source) || isTypedArray(source));
          if (!isSrcArr) {
            var props = keys(source);
            push.apply(props, getSymbols(source));
          }
          arrayEach(props || source, function(srcValue, key) {
            if (props) {
              key = srcValue;
              srcValue = source[key];
            }
            if (isObjectLike(srcValue)) {
              stackA || (stackA = []);
              stackB || (stackB = []);
              baseMergeDeep(object, source, key, baseMerge, customizer, stackA, stackB);
            } else {
              var value = object[key],
                  result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
                  isCommon = result === undefined;
              if (isCommon) {
                result = srcValue;
              }
              if ((isSrcArr || result !== undefined) && (isCommon || (result === result ? (result !== value) : (value === value)))) {
                object[key] = result;
              }
            }
          });
          return object;
        }
        function baseMergeDeep(object, source, key, mergeFunc, customizer, stackA, stackB) {
          var length = stackA.length,
              srcValue = source[key];
          while (length--) {
            if (stackA[length] == srcValue) {
              object[key] = stackB[length];
              return ;
            }
          }
          var value = object[key],
              result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
              isCommon = result === undefined;
          if (isCommon) {
            result = srcValue;
            if (isArrayLike(srcValue) && (isArray(srcValue) || isTypedArray(srcValue))) {
              result = isArray(value) ? value : (isArrayLike(value) ? arrayCopy(value) : []);
            } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
              result = isArguments(value) ? toPlainObject(value) : (isPlainObject(value) ? value : {});
            } else {
              isCommon = false;
            }
          }
          stackA.push(srcValue);
          stackB.push(result);
          if (isCommon) {
            object[key] = mergeFunc(result, srcValue, customizer, stackA, stackB);
          } else if (result === result ? (result !== value) : (value === value)) {
            object[key] = result;
          }
        }
        function baseProperty(key) {
          return function(object) {
            return object == null ? undefined : object[key];
          };
        }
        function basePropertyDeep(path) {
          var pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            return baseGet(object, path, pathKey);
          };
        }
        function basePullAt(array, indexes) {
          var length = array ? indexes.length : 0;
          while (length--) {
            var index = parseFloat(indexes[length]);
            if (index != previous && isIndex(index)) {
              var previous = index;
              splice.call(array, index, 1);
            }
          }
          return array;
        }
        function baseRandom(min, max) {
          return min + floor(nativeRandom() * (max - min + 1));
        }
        function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc) {
          eachFunc(collection, function(value, index, collection) {
            accumulator = initFromCollection ? (initFromCollection = false, value) : iteratee(accumulator, value, index, collection);
          });
          return accumulator;
        }
        var baseSetData = !metaMap ? identity : function(func, data) {
          metaMap.set(func, data);
          return func;
        };
        function baseSlice(array, start, end) {
          var index = -1,
              length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : ((end - start) >>> 0);
          start >>>= 0;
          var result = Array(length);
          while (++index < length) {
            result[index] = array[index + start];
          }
          return result;
        }
        function baseSome(collection, predicate) {
          var result;
          baseEach(collection, function(value, index, collection) {
            result = predicate(value, index, collection);
            return !result;
          });
          return !!result;
        }
        function baseSortBy(array, comparer) {
          var length = array.length;
          array.sort(comparer);
          while (length--) {
            array[length] = array[length].value;
          }
          return array;
        }
        function baseSortByOrder(collection, iteratees, orders) {
          var callback = getCallback(),
              index = -1;
          iteratees = arrayMap(iteratees, function(iteratee) {
            return callback(iteratee);
          });
          var result = baseMap(collection, function(value) {
            var criteria = arrayMap(iteratees, function(iteratee) {
              return iteratee(value);
            });
            return {
              'criteria': criteria,
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, function(object, other) {
            return compareMultiple(object, other, orders);
          });
        }
        function baseSum(collection, iteratee) {
          var result = 0;
          baseEach(collection, function(value, index, collection) {
            result += +iteratee(value, index, collection) || 0;
          });
          return result;
        }
        function baseUniq(array, iteratee) {
          var index = -1,
              indexOf = getIndexOf(),
              length = array.length,
              isCommon = indexOf == baseIndexOf,
              isLarge = isCommon && length >= 200,
              seen = isLarge ? createCache() : null,
              result = [];
          if (seen) {
            indexOf = cacheIndexOf;
            isCommon = false;
          } else {
            isLarge = false;
            seen = iteratee ? [] : result;
          }
          outer: while (++index < length) {
            var value = array[index],
                computed = iteratee ? iteratee(value, index, array) : value;
            if (isCommon && value === value) {
              var seenIndex = seen.length;
              while (seenIndex--) {
                if (seen[seenIndex] === computed) {
                  continue outer;
                }
              }
              if (iteratee) {
                seen.push(computed);
              }
              result.push(value);
            } else if (indexOf(seen, computed, 0) < 0) {
              if (iteratee || isLarge) {
                seen.push(computed);
              }
              result.push(value);
            }
          }
          return result;
        }
        function baseValues(object, props) {
          var index = -1,
              length = props.length,
              result = Array(length);
          while (++index < length) {
            result[index] = object[props[index]];
          }
          return result;
        }
        function baseWhile(array, predicate, isDrop, fromRight) {
          var length = array.length,
              index = fromRight ? length : -1;
          while ((fromRight ? index-- : ++index < length) && predicate(array[index], index, array)) {}
          return isDrop ? baseSlice(array, (fromRight ? 0 : index), (fromRight ? index + 1 : length)) : baseSlice(array, (fromRight ? index + 1 : 0), (fromRight ? length : index));
        }
        function baseWrapperValue(value, actions) {
          var result = value;
          if (result instanceof LazyWrapper) {
            result = result.value();
          }
          var index = -1,
              length = actions.length;
          while (++index < length) {
            var args = [result],
                action = actions[index];
            push.apply(args, action.args);
            result = action.func.apply(action.thisArg, args);
          }
          return result;
        }
        function binaryIndex(array, value, retHighest) {
          var low = 0,
              high = array ? array.length : low;
          if (typeof value == 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
            while (low < high) {
              var mid = (low + high) >>> 1,
                  computed = array[mid];
              if (retHighest ? (computed <= value) : (computed < value)) {
                low = mid + 1;
              } else {
                high = mid;
              }
            }
            return high;
          }
          return binaryIndexBy(array, value, identity, retHighest);
        }
        function binaryIndexBy(array, value, iteratee, retHighest) {
          value = iteratee(value);
          var low = 0,
              high = array ? array.length : 0,
              valIsNaN = value !== value,
              valIsUndef = value === undefined;
          while (low < high) {
            var mid = floor((low + high) / 2),
                computed = iteratee(array[mid]),
                isReflexive = computed === computed;
            if (valIsNaN) {
              var setLow = isReflexive || retHighest;
            } else if (valIsUndef) {
              setLow = isReflexive && (retHighest || computed !== undefined);
            } else {
              setLow = retHighest ? (computed <= value) : (computed < value);
            }
            if (setLow) {
              low = mid + 1;
            } else {
              high = mid;
            }
          }
          return nativeMin(high, MAX_ARRAY_INDEX);
        }
        function bindCallback(func, thisArg, argCount) {
          if (typeof func != 'function') {
            return identity;
          }
          if (thisArg === undefined) {
            return func;
          }
          switch (argCount) {
            case 1:
              return function(value) {
                return func.call(thisArg, value);
              };
            case 3:
              return function(value, index, collection) {
                return func.call(thisArg, value, index, collection);
              };
            case 4:
              return function(accumulator, value, index, collection) {
                return func.call(thisArg, accumulator, value, index, collection);
              };
            case 5:
              return function(value, other, key, object, source) {
                return func.call(thisArg, value, other, key, object, source);
              };
          }
          return function() {
            return func.apply(thisArg, arguments);
          };
        }
        function bufferClone(buffer) {
          return bufferSlice.call(buffer, 0);
        }
        if (!bufferSlice) {
          bufferClone = !(ArrayBuffer && Uint8Array) ? constant(null) : function(buffer) {
            var byteLength = buffer.byteLength,
                floatLength = Float64Array ? floor(byteLength / FLOAT64_BYTES_PER_ELEMENT) : 0,
                offset = floatLength * FLOAT64_BYTES_PER_ELEMENT,
                result = new ArrayBuffer(byteLength);
            if (floatLength) {
              var view = new Float64Array(result, 0, floatLength);
              view.set(new Float64Array(buffer, 0, floatLength));
            }
            if (byteLength != offset) {
              view = new Uint8Array(result, offset);
              view.set(new Uint8Array(buffer, offset));
            }
            return result;
          };
        }
        function composeArgs(args, partials, holders) {
          var holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              leftIndex = -1,
              leftLength = partials.length,
              result = Array(argsLength + leftLength);
          while (++leftIndex < leftLength) {
            result[leftIndex] = partials[leftIndex];
          }
          while (++argsIndex < holdersLength) {
            result[holders[argsIndex]] = args[argsIndex];
          }
          while (argsLength--) {
            result[leftIndex++] = args[argsIndex++];
          }
          return result;
        }
        function composeArgsRight(args, partials, holders) {
          var holdersIndex = -1,
              holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              rightIndex = -1,
              rightLength = partials.length,
              result = Array(argsLength + rightLength);
          while (++argsIndex < argsLength) {
            result[argsIndex] = args[argsIndex];
          }
          var offset = argsIndex;
          while (++rightIndex < rightLength) {
            result[offset + rightIndex] = partials[rightIndex];
          }
          while (++holdersIndex < holdersLength) {
            result[offset + holders[holdersIndex]] = args[argsIndex++];
          }
          return result;
        }
        function createAggregator(setter, initializer) {
          return function(collection, iteratee, thisArg) {
            var result = initializer ? initializer() : {};
            iteratee = getCallback(iteratee, thisArg, 3);
            if (isArray(collection)) {
              var index = -1,
                  length = collection.length;
              while (++index < length) {
                var value = collection[index];
                setter(result, value, iteratee(value, index, collection), collection);
              }
            } else {
              baseEach(collection, function(value, key, collection) {
                setter(result, value, iteratee(value, key, collection), collection);
              });
            }
            return result;
          };
        }
        function createAssigner(assigner) {
          return restParam(function(object, sources) {
            var index = -1,
                length = object == null ? 0 : sources.length,
                customizer = length > 2 && sources[length - 2],
                guard = length > 2 && sources[2],
                thisArg = length > 1 && sources[length - 1];
            if (typeof customizer == 'function') {
              customizer = bindCallback(customizer, thisArg, 5);
              length -= 2;
            } else {
              customizer = typeof thisArg == 'function' ? thisArg : null;
              length -= (customizer ? 1 : 0);
            }
            if (guard && isIterateeCall(sources[0], sources[1], guard)) {
              customizer = length < 3 ? null : customizer;
              length = 1;
            }
            while (++index < length) {
              var source = sources[index];
              if (source) {
                assigner(object, source, customizer);
              }
            }
            return object;
          });
        }
        function createBaseEach(eachFunc, fromRight) {
          return function(collection, iteratee) {
            var length = collection ? getLength(collection) : 0;
            if (!isLength(length)) {
              return eachFunc(collection, iteratee);
            }
            var index = fromRight ? length : -1,
                iterable = toObject(collection);
            while ((fromRight ? index-- : ++index < length)) {
              if (iteratee(iterable[index], index, iterable) === false) {
                break;
              }
            }
            return collection;
          };
        }
        function createBaseFor(fromRight) {
          return function(object, iteratee, keysFunc) {
            var iterable = toObject(object),
                props = keysFunc(object),
                length = props.length,
                index = fromRight ? length : -1;
            while ((fromRight ? index-- : ++index < length)) {
              var key = props[index];
              if (iteratee(iterable[key], key, iterable) === false) {
                break;
              }
            }
            return object;
          };
        }
        function createBindWrapper(func, thisArg) {
          var Ctor = createCtorWrapper(func);
          function wrapper() {
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(thisArg, arguments);
          }
          return wrapper;
        }
        var createCache = !(nativeCreate && Set) ? constant(null) : function(values) {
          return new SetCache(values);
        };
        function createCompounder(callback) {
          return function(string) {
            var index = -1,
                array = words(deburr(string)),
                length = array.length,
                result = '';
            while (++index < length) {
              result = callback(result, array[index], index);
            }
            return result;
          };
        }
        function createCtorWrapper(Ctor) {
          return function() {
            var thisBinding = baseCreate(Ctor.prototype),
                result = Ctor.apply(thisBinding, arguments);
            return isObject(result) ? result : thisBinding;
          };
        }
        function createCurry(flag) {
          function curryFunc(func, arity, guard) {
            if (guard && isIterateeCall(func, arity, guard)) {
              arity = null;
            }
            var result = createWrapper(func, flag, null, null, null, null, null, arity);
            result.placeholder = curryFunc.placeholder;
            return result;
          }
          return curryFunc;
        }
        function createExtremum(arrayFunc, isMin) {
          return function(collection, iteratee, thisArg) {
            if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
              iteratee = null;
            }
            var func = getCallback(),
                noIteratee = iteratee == null;
            if (!(func === baseCallback && noIteratee)) {
              noIteratee = false;
              iteratee = func(iteratee, thisArg, 3);
            }
            if (noIteratee) {
              var isArr = isArray(collection);
              if (!isArr && isString(collection)) {
                iteratee = charAtCallback;
              } else {
                return arrayFunc(isArr ? collection : toIterable(collection));
              }
            }
            return extremumBy(collection, iteratee, isMin);
          };
        }
        function createFind(eachFunc, fromRight) {
          return function(collection, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            if (isArray(collection)) {
              var index = baseFindIndex(collection, predicate, fromRight);
              return index > -1 ? collection[index] : undefined;
            }
            return baseFind(collection, predicate, eachFunc);
          };
        }
        function createFindIndex(fromRight) {
          return function(array, predicate, thisArg) {
            if (!(array && array.length)) {
              return -1;
            }
            predicate = getCallback(predicate, thisArg, 3);
            return baseFindIndex(array, predicate, fromRight);
          };
        }
        function createFindKey(objectFunc) {
          return function(object, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            return baseFind(object, predicate, objectFunc, true);
          };
        }
        function createFlow(fromRight) {
          return function() {
            var length = arguments.length;
            if (!length) {
              return function() {
                return arguments[0];
              };
            }
            var wrapper,
                index = fromRight ? length : -1,
                leftIndex = 0,
                funcs = Array(length);
            while ((fromRight ? index-- : ++index < length)) {
              var func = funcs[leftIndex++] = arguments[index];
              if (typeof func != 'function') {
                throw new TypeError(FUNC_ERROR_TEXT);
              }
              var funcName = wrapper ? '' : getFuncName(func);
              wrapper = funcName == 'wrapper' ? new LodashWrapper([]) : wrapper;
            }
            index = wrapper ? -1 : length;
            while (++index < length) {
              func = funcs[index];
              funcName = getFuncName(func);
              var data = funcName == 'wrapper' ? getData(func) : null;
              if (data && isLaziable(data[0]) && data[1] == (ARY_FLAG | CURRY_FLAG | PARTIAL_FLAG | REARG_FLAG) && !data[4].length && data[9] == 1) {
                wrapper = wrapper[getFuncName(data[0])].apply(wrapper, data[3]);
              } else {
                wrapper = (func.length == 1 && isLaziable(func)) ? wrapper[funcName]() : wrapper.thru(func);
              }
            }
            return function() {
              var args = arguments;
              if (wrapper && args.length == 1 && isArray(args[0])) {
                return wrapper.plant(args[0]).value();
              }
              var index = 0,
                  result = funcs[index].apply(this, args);
              while (++index < length) {
                result = funcs[index].call(this, result);
              }
              return result;
            };
          };
        }
        function createForEach(arrayFunc, eachFunc) {
          return function(collection, iteratee, thisArg) {
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee) : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
          };
        }
        function createForIn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee, keysIn);
          };
        }
        function createForOwn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee);
          };
        }
        function createObjectMapper(isMapKeys) {
          return function(object, iteratee, thisArg) {
            var result = {};
            iteratee = getCallback(iteratee, thisArg, 3);
            baseForOwn(object, function(value, key, object) {
              var mapped = iteratee(value, key, object);
              key = isMapKeys ? mapped : key;
              value = isMapKeys ? value : mapped;
              result[key] = value;
            });
            return result;
          };
        }
        function createPadDir(fromRight) {
          return function(string, length, chars) {
            string = baseToString(string);
            return (fromRight ? string : '') + createPadding(string, length, chars) + (fromRight ? '' : string);
          };
        }
        function createPartial(flag) {
          var partialFunc = restParam(function(func, partials) {
            var holders = replaceHolders(partials, partialFunc.placeholder);
            return createWrapper(func, flag, null, partials, holders);
          });
          return partialFunc;
        }
        function createReduce(arrayFunc, eachFunc) {
          return function(collection, iteratee, accumulator, thisArg) {
            var initFromArray = arguments.length < 3;
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee, accumulator, initFromArray) : baseReduce(collection, getCallback(iteratee, thisArg, 4), accumulator, initFromArray, eachFunc);
          };
        }
        function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
          var isAry = bitmask & ARY_FLAG,
              isBind = bitmask & BIND_FLAG,
              isBindKey = bitmask & BIND_KEY_FLAG,
              isCurry = bitmask & CURRY_FLAG,
              isCurryBound = bitmask & CURRY_BOUND_FLAG,
              isCurryRight = bitmask & CURRY_RIGHT_FLAG;
          var Ctor = !isBindKey && createCtorWrapper(func),
              key = func;
          function wrapper() {
            var length = arguments.length,
                index = length,
                args = Array(length);
            while (index--) {
              args[index] = arguments[index];
            }
            if (partials) {
              args = composeArgs(args, partials, holders);
            }
            if (partialsRight) {
              args = composeArgsRight(args, partialsRight, holdersRight);
            }
            if (isCurry || isCurryRight) {
              var placeholder = wrapper.placeholder,
                  argsHolders = replaceHolders(args, placeholder);
              length -= argsHolders.length;
              if (length < arity) {
                var newArgPos = argPos ? arrayCopy(argPos) : null,
                    newArity = nativeMax(arity - length, 0),
                    newsHolders = isCurry ? argsHolders : null,
                    newHoldersRight = isCurry ? null : argsHolders,
                    newPartials = isCurry ? args : null,
                    newPartialsRight = isCurry ? null : args;
                bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
                bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);
                if (!isCurryBound) {
                  bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
                }
                var newData = [func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity],
                    result = createHybridWrapper.apply(undefined, newData);
                if (isLaziable(func)) {
                  setData(result, newData);
                }
                result.placeholder = placeholder;
                return result;
              }
            }
            var thisBinding = isBind ? thisArg : this;
            if (isBindKey) {
              func = thisBinding[key];
            }
            if (argPos) {
              args = reorder(args, argPos);
            }
            if (isAry && ary < args.length) {
              args.length = ary;
            }
            var fn = (this && this !== root && this instanceof wrapper) ? (Ctor || createCtorWrapper(func)) : func;
            return fn.apply(thisBinding, args);
          }
          return wrapper;
        }
        function createPadding(string, length, chars) {
          var strLength = string.length;
          length = +length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return '';
          }
          var padLength = length - strLength;
          chars = chars == null ? ' ' : (chars + '');
          return repeat(chars, ceil(padLength / chars.length)).slice(0, padLength);
        }
        function createPartialWrapper(func, bitmask, thisArg, partials) {
          var isBind = bitmask & BIND_FLAG,
              Ctor = createCtorWrapper(func);
          function wrapper() {
            var argsIndex = -1,
                argsLength = arguments.length,
                leftIndex = -1,
                leftLength = partials.length,
                args = Array(argsLength + leftLength);
            while (++leftIndex < leftLength) {
              args[leftIndex] = partials[leftIndex];
            }
            while (argsLength--) {
              args[leftIndex++] = arguments[++argsIndex];
            }
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(isBind ? thisArg : this, args);
          }
          return wrapper;
        }
        function createSortedIndex(retHighest) {
          return function(array, value, iteratee, thisArg) {
            var func = getCallback(iteratee);
            return (func === baseCallback && iteratee == null) ? binaryIndex(array, value, retHighest) : binaryIndexBy(array, value, func(iteratee, thisArg, 1), retHighest);
          };
        }
        function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
          var isBindKey = bitmask & BIND_KEY_FLAG;
          if (!isBindKey && typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var length = partials ? partials.length : 0;
          if (!length) {
            bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
            partials = holders = null;
          }
          length -= (holders ? holders.length : 0);
          if (bitmask & PARTIAL_RIGHT_FLAG) {
            var partialsRight = partials,
                holdersRight = holders;
            partials = holders = null;
          }
          var data = isBindKey ? null : getData(func),
              newData = [func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];
          if (data) {
            mergeData(newData, data);
            bitmask = newData[1];
            arity = newData[9];
          }
          newData[9] = arity == null ? (isBindKey ? 0 : func.length) : (nativeMax(arity - length, 0) || 0);
          if (bitmask == BIND_FLAG) {
            var result = createBindWrapper(newData[0], newData[2]);
          } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length) {
            result = createPartialWrapper.apply(undefined, newData);
          } else {
            result = createHybridWrapper.apply(undefined, newData);
          }
          var setter = data ? baseSetData : setData;
          return setter(result, newData);
        }
        function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var index = -1,
              arrLength = array.length,
              othLength = other.length,
              result = true;
          if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
            return false;
          }
          while (result && ++index < arrLength) {
            var arrValue = array[index],
                othValue = other[index];
            result = undefined;
            if (customizer) {
              result = isLoose ? customizer(othValue, arrValue, index) : customizer(arrValue, othValue, index);
            }
            if (result === undefined) {
              if (isLoose) {
                var othIndex = othLength;
                while (othIndex--) {
                  othValue = other[othIndex];
                  result = (arrValue && arrValue === othValue) || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
                  if (result) {
                    break;
                  }
                }
              } else {
                result = (arrValue && arrValue === othValue) || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
              }
            }
          }
          return !!result;
        }
        function equalByTag(object, other, tag) {
          switch (tag) {
            case boolTag:
            case dateTag:
              return +object == +other;
            case errorTag:
              return object.name == other.name && object.message == other.message;
            case numberTag:
              return (object != +object) ? other != +other : object == +other;
            case regexpTag:
            case stringTag:
              return object == (other + '');
          }
          return false;
        }
        function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objProps = keys(object),
              objLength = objProps.length,
              othProps = keys(other),
              othLength = othProps.length;
          if (objLength != othLength && !isLoose) {
            return false;
          }
          var skipCtor = isLoose,
              index = -1;
          while (++index < objLength) {
            var key = objProps[index],
                result = isLoose ? key in other : hasOwnProperty.call(other, key);
            if (result) {
              var objValue = object[key],
                  othValue = other[key];
              result = undefined;
              if (customizer) {
                result = isLoose ? customizer(othValue, objValue, key) : customizer(objValue, othValue, key);
              }
              if (result === undefined) {
                result = (objValue && objValue === othValue) || equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB);
              }
            }
            if (!result) {
              return false;
            }
            skipCtor || (skipCtor = key == 'constructor');
          }
          if (!skipCtor) {
            var objCtor = object.constructor,
                othCtor = other.constructor;
            if (objCtor != othCtor && ('constructor' in object && 'constructor' in other) && !(typeof objCtor == 'function' && objCtor instanceof objCtor && typeof othCtor == 'function' && othCtor instanceof othCtor)) {
              return false;
            }
          }
          return true;
        }
        function extremumBy(collection, iteratee, isMin) {
          var exValue = isMin ? POSITIVE_INFINITY : NEGATIVE_INFINITY,
              computed = exValue,
              result = computed;
          baseEach(collection, function(value, index, collection) {
            var current = iteratee(value, index, collection);
            if ((isMin ? (current < computed) : (current > computed)) || (current === exValue && current === result)) {
              computed = current;
              result = value;
            }
          });
          return result;
        }
        function getCallback(func, thisArg, argCount) {
          var result = lodash.callback || callback;
          result = result === callback ? baseCallback : result;
          return argCount ? result(func, thisArg, argCount) : result;
        }
        var getData = !metaMap ? noop : function(func) {
          return metaMap.get(func);
        };
        var getFuncName = (function() {
          if (!support.funcNames) {
            return constant('');
          }
          if (constant.name == 'constant') {
            return baseProperty('name');
          }
          return function(func) {
            var result = func.name,
                array = realNames[result],
                length = array ? array.length : 0;
            while (length--) {
              var data = array[length],
                  otherFunc = data.func;
              if (otherFunc == null || otherFunc == func) {
                return data.name;
              }
            }
            return result;
          };
        }());
        function getIndexOf(collection, target, fromIndex) {
          var result = lodash.indexOf || indexOf;
          result = result === indexOf ? baseIndexOf : result;
          return collection ? result(collection, target, fromIndex) : result;
        }
        var getLength = baseProperty('length');
        var getSymbols = !getOwnPropertySymbols ? constant([]) : function(object) {
          return getOwnPropertySymbols(toObject(object));
        };
        function getView(start, end, transforms) {
          var index = -1,
              length = transforms ? transforms.length : 0;
          while (++index < length) {
            var data = transforms[index],
                size = data.size;
            switch (data.type) {
              case 'drop':
                start += size;
                break;
              case 'dropRight':
                end -= size;
                break;
              case 'take':
                end = nativeMin(end, start + size);
                break;
              case 'takeRight':
                start = nativeMax(start, end - size);
                break;
            }
          }
          return {
            'start': start,
            'end': end
          };
        }
        function initCloneArray(array) {
          var length = array.length,
              result = new array.constructor(length);
          if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
            result.index = array.index;
            result.input = array.input;
          }
          return result;
        }
        function initCloneObject(object) {
          var Ctor = object.constructor;
          if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
            Ctor = Object;
          }
          return new Ctor;
        }
        function initCloneByTag(object, tag, isDeep) {
          var Ctor = object.constructor;
          switch (tag) {
            case arrayBufferTag:
              return bufferClone(object);
            case boolTag:
            case dateTag:
              return new Ctor(+object);
            case float32Tag:
            case float64Tag:
            case int8Tag:
            case int16Tag:
            case int32Tag:
            case uint8Tag:
            case uint8ClampedTag:
            case uint16Tag:
            case uint32Tag:
              var buffer = object.buffer;
              return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);
            case numberTag:
            case stringTag:
              return new Ctor(object);
            case regexpTag:
              var result = new Ctor(object.source, reFlags.exec(object));
              result.lastIndex = object.lastIndex;
          }
          return result;
        }
        function invokePath(object, path, args) {
          if (object != null && !isKey(path, object)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            path = last(path);
          }
          var func = object == null ? object : object[path];
          return func == null ? undefined : func.apply(object, args);
        }
        function isArrayLike(value) {
          return value != null && isLength(getLength(value));
        }
        function isIndex(value, length) {
          value = +value;
          length = length == null ? MAX_SAFE_INTEGER : length;
          return value > -1 && value % 1 == 0 && value < length;
        }
        function isIterateeCall(value, index, object) {
          if (!isObject(object)) {
            return false;
          }
          var type = typeof index;
          if (type == 'number' ? (isArrayLike(object) && isIndex(index, object.length)) : (type == 'string' && index in object)) {
            var other = object[index];
            return value === value ? (value === other) : (other !== other);
          }
          return false;
        }
        function isKey(value, object) {
          var type = typeof value;
          if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
            return true;
          }
          if (isArray(value)) {
            return false;
          }
          var result = !reIsDeepProp.test(value);
          return result || (object != null && value in toObject(object));
        }
        function isLaziable(func) {
          var funcName = getFuncName(func);
          return !!funcName && func === lodash[funcName] && funcName in LazyWrapper.prototype;
        }
        function isLength(value) {
          return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
        }
        function isStrictComparable(value) {
          return value === value && !isObject(value);
        }
        function mergeData(data, source) {
          var bitmask = data[1],
              srcBitmask = source[1],
              newBitmask = bitmask | srcBitmask,
              isCommon = newBitmask < ARY_FLAG;
          var isCombo = (srcBitmask == ARY_FLAG && bitmask == CURRY_FLAG) || (srcBitmask == ARY_FLAG && bitmask == REARG_FLAG && data[7].length <= source[8]) || (srcBitmask == (ARY_FLAG | REARG_FLAG) && bitmask == CURRY_FLAG);
          if (!(isCommon || isCombo)) {
            return data;
          }
          if (srcBitmask & BIND_FLAG) {
            data[2] = source[2];
            newBitmask |= (bitmask & BIND_FLAG) ? 0 : CURRY_BOUND_FLAG;
          }
          var value = source[3];
          if (value) {
            var partials = data[3];
            data[3] = partials ? composeArgs(partials, value, source[4]) : arrayCopy(value);
            data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : arrayCopy(source[4]);
          }
          value = source[5];
          if (value) {
            partials = data[5];
            data[5] = partials ? composeArgsRight(partials, value, source[6]) : arrayCopy(value);
            data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : arrayCopy(source[6]);
          }
          value = source[7];
          if (value) {
            data[7] = arrayCopy(value);
          }
          if (srcBitmask & ARY_FLAG) {
            data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
          }
          if (data[9] == null) {
            data[9] = source[9];
          }
          data[0] = source[0];
          data[1] = newBitmask;
          return data;
        }
        function pickByArray(object, props) {
          object = toObject(object);
          var index = -1,
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index];
            if (key in object) {
              result[key] = object[key];
            }
          }
          return result;
        }
        function pickByCallback(object, predicate) {
          var result = {};
          baseForIn(object, function(value, key, object) {
            if (predicate(value, key, object)) {
              result[key] = value;
            }
          });
          return result;
        }
        function reorder(array, indexes) {
          var arrLength = array.length,
              length = nativeMin(indexes.length, arrLength),
              oldArray = arrayCopy(array);
          while (length--) {
            var index = indexes[length];
            array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
          }
          return array;
        }
        var setData = (function() {
          var count = 0,
              lastCalled = 0;
          return function(key, value) {
            var stamp = now(),
                remaining = HOT_SPAN - (stamp - lastCalled);
            lastCalled = stamp;
            if (remaining > 0) {
              if (++count >= HOT_COUNT) {
                return key;
              }
            } else {
              count = 0;
            }
            return baseSetData(key, value);
          };
        }());
        function shimIsPlainObject(value) {
          var Ctor,
              support = lodash.support;
          if (!(isObjectLike(value) && objToString.call(value) == objectTag) || (!hasOwnProperty.call(value, 'constructor') && (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor)))) {
            return false;
          }
          var result;
          baseForIn(value, function(subValue, key) {
            result = key;
          });
          return result === undefined || hasOwnProperty.call(value, result);
        }
        function shimKeys(object) {
          var props = keysIn(object),
              propsLength = props.length,
              length = propsLength && object.length,
              support = lodash.support;
          var allowIndexes = length && isLength(length) && (isArray(object) || (support.nonEnumArgs && isArguments(object)));
          var index = -1,
              result = [];
          while (++index < propsLength) {
            var key = props[index];
            if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
              result.push(key);
            }
          }
          return result;
        }
        function toIterable(value) {
          if (value == null) {
            return [];
          }
          if (!isArrayLike(value)) {
            return values(value);
          }
          return isObject(value) ? value : Object(value);
        }
        function toObject(value) {
          return isObject(value) ? value : Object(value);
        }
        function toPath(value) {
          if (isArray(value)) {
            return value;
          }
          var result = [];
          baseToString(value).replace(rePropName, function(match, number, quote, string) {
            result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
          });
          return result;
        }
        function wrapperClone(wrapper) {
          return wrapper instanceof LazyWrapper ? wrapper.clone() : new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__, arrayCopy(wrapper.__actions__));
        }
        function chunk(array, size, guard) {
          if (guard ? isIterateeCall(array, size, guard) : size == null) {
            size = 1;
          } else {
            size = nativeMax(+size || 1, 1);
          }
          var index = 0,
              length = array ? array.length : 0,
              resIndex = -1,
              result = Array(ceil(length / size));
          while (index < length) {
            result[++resIndex] = baseSlice(array, index, (index += size));
          }
          return result;
        }
        function compact(array) {
          var index = -1,
              length = array ? array.length : 0,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (value) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        var difference = restParam(function(array, values) {
          return isArrayLike(array) ? baseDifference(array, baseFlatten(values, false, true)) : [];
        });
        function drop(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function dropRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function dropRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true, true) : [];
        }
        function dropWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true) : [];
        }
        function fill(array, value, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (start && typeof start != 'number' && isIterateeCall(array, value, start)) {
            start = 0;
            end = length;
          }
          return baseFill(array, value, start, end);
        }
        var findIndex = createFindIndex();
        var findLastIndex = createFindIndex(true);
        function first(array) {
          return array ? array[0] : undefined;
        }
        function flatten(array, isDeep, guard) {
          var length = array ? array.length : 0;
          if (guard && isIterateeCall(array, isDeep, guard)) {
            isDeep = false;
          }
          return length ? baseFlatten(array, isDeep) : [];
        }
        function flattenDeep(array) {
          var length = array ? array.length : 0;
          return length ? baseFlatten(array, true) : [];
        }
        function indexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          if (typeof fromIndex == 'number') {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : fromIndex;
          } else if (fromIndex) {
            var index = binaryIndex(array, value),
                other = array[index];
            if (value === value ? (value === other) : (other !== other)) {
              return index;
            }
            return -1;
          }
          return baseIndexOf(array, value, fromIndex || 0);
        }
        function initial(array) {
          return dropRight(array, 1);
        }
        function intersection() {
          var args = [],
              argsIndex = -1,
              argsLength = arguments.length,
              caches = [],
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              result = [];
          while (++argsIndex < argsLength) {
            var value = arguments[argsIndex];
            if (isArrayLike(value)) {
              args.push(value);
              caches.push((isCommon && value.length >= 120) ? createCache(argsIndex && value) : null);
            }
          }
          argsLength = args.length;
          if (argsLength < 2) {
            return result;
          }
          var array = args[0],
              index = -1,
              length = array ? array.length : 0,
              seen = caches[0];
          outer: while (++index < length) {
            value = array[index];
            if ((seen ? cacheIndexOf(seen, value) : indexOf(result, value, 0)) < 0) {
              argsIndex = argsLength;
              while (--argsIndex) {
                var cache = caches[argsIndex];
                if ((cache ? cacheIndexOf(cache, value) : indexOf(args[argsIndex], value, 0)) < 0) {
                  continue outer;
                }
              }
              if (seen) {
                seen.push(value);
              }
              result.push(value);
            }
          }
          return result;
        }
        function last(array) {
          var length = array ? array.length : 0;
          return length ? array[length - 1] : undefined;
        }
        function lastIndexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          var index = length;
          if (typeof fromIndex == 'number') {
            index = (fromIndex < 0 ? nativeMax(length + fromIndex, 0) : nativeMin(fromIndex || 0, length - 1)) + 1;
          } else if (fromIndex) {
            index = binaryIndex(array, value, true) - 1;
            var other = array[index];
            if (value === value ? (value === other) : (other !== other)) {
              return index;
            }
            return -1;
          }
          if (value !== value) {
            return indexOfNaN(array, index, true);
          }
          while (index--) {
            if (array[index] === value) {
              return index;
            }
          }
          return -1;
        }
        function pull() {
          var args = arguments,
              array = args[0];
          if (!(array && array.length)) {
            return array;
          }
          var index = 0,
              indexOf = getIndexOf(),
              length = args.length;
          while (++index < length) {
            var fromIndex = 0,
                value = args[index];
            while ((fromIndex = indexOf(array, value, fromIndex)) > -1) {
              splice.call(array, fromIndex, 1);
            }
          }
          return array;
        }
        var pullAt = restParam(function(array, indexes) {
          indexes = baseFlatten(indexes);
          var result = baseAt(array, indexes);
          basePullAt(array, indexes.sort(baseCompareAscending));
          return result;
        });
        function remove(array, predicate, thisArg) {
          var result = [];
          if (!(array && array.length)) {
            return result;
          }
          var index = -1,
              indexes = [],
              length = array.length;
          predicate = getCallback(predicate, thisArg, 3);
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result.push(value);
              indexes.push(index);
            }
          }
          basePullAt(array, indexes);
          return result;
        }
        function rest(array) {
          return drop(array, 1);
        }
        function slice(array, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (end && typeof end != 'number' && isIterateeCall(array, start, end)) {
            start = 0;
            end = length;
          }
          return baseSlice(array, start, end);
        }
        var sortedIndex = createSortedIndex();
        var sortedLastIndex = createSortedIndex(true);
        function take(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function takeRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function takeRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), false, true) : [];
        }
        function takeWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3)) : [];
        }
        var union = restParam(function(arrays) {
          return baseUniq(baseFlatten(arrays, false, true));
        });
        function uniq(array, isSorted, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (isSorted != null && typeof isSorted != 'boolean') {
            thisArg = iteratee;
            iteratee = isIterateeCall(array, isSorted, thisArg) ? null : isSorted;
            isSorted = false;
          }
          var func = getCallback();
          if (!(func === baseCallback && iteratee == null)) {
            iteratee = func(iteratee, thisArg, 3);
          }
          return (isSorted && getIndexOf() == baseIndexOf) ? sortedUniq(array, iteratee) : baseUniq(array, iteratee);
        }
        function unzip(array) {
          if (!(array && array.length)) {
            return [];
          }
          var index = -1,
              length = 0;
          array = arrayFilter(array, function(group) {
            if (isArrayLike(group)) {
              length = nativeMax(group.length, length);
              return true;
            }
          });
          var result = Array(length);
          while (++index < length) {
            result[index] = arrayMap(array, baseProperty(index));
          }
          return result;
        }
        function unzipWith(array, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          var result = unzip(array);
          if (iteratee == null) {
            return result;
          }
          iteratee = bindCallback(iteratee, thisArg, 4);
          return arrayMap(result, function(group) {
            return arrayReduce(group, iteratee, undefined, true);
          });
        }
        var without = restParam(function(array, values) {
          return isArrayLike(array) ? baseDifference(array, values) : [];
        });
        function xor() {
          var index = -1,
              length = arguments.length;
          while (++index < length) {
            var array = arguments[index];
            if (isArrayLike(array)) {
              var result = result ? baseDifference(result, array).concat(baseDifference(array, result)) : array;
            }
          }
          return result ? baseUniq(result) : [];
        }
        var zip = restParam(unzip);
        function zipObject(props, values) {
          var index = -1,
              length = props ? props.length : 0,
              result = {};
          if (length && !values && !isArray(props[0])) {
            values = [];
          }
          while (++index < length) {
            var key = props[index];
            if (values) {
              result[key] = values[index];
            } else if (key) {
              result[key[0]] = key[1];
            }
          }
          return result;
        }
        var zipWith = restParam(function(arrays) {
          var length = arrays.length,
              iteratee = arrays[length - 2],
              thisArg = arrays[length - 1];
          if (length > 2 && typeof iteratee == 'function') {
            length -= 2;
          } else {
            iteratee = (length > 1 && typeof thisArg == 'function') ? (--length, thisArg) : undefined;
            thisArg = undefined;
          }
          arrays.length = length;
          return unzipWith(arrays, iteratee, thisArg);
        });
        function chain(value) {
          var result = lodash(value);
          result.__chain__ = true;
          return result;
        }
        function tap(value, interceptor, thisArg) {
          interceptor.call(thisArg, value);
          return value;
        }
        function thru(value, interceptor, thisArg) {
          return interceptor.call(thisArg, value);
        }
        function wrapperChain() {
          return chain(this);
        }
        function wrapperCommit() {
          return new LodashWrapper(this.value(), this.__chain__);
        }
        function wrapperPlant(value) {
          var result,
              parent = this;
          while (parent instanceof baseLodash) {
            var clone = wrapperClone(parent);
            if (result) {
              previous.__wrapped__ = clone;
            } else {
              result = clone;
            }
            var previous = clone;
            parent = parent.__wrapped__;
          }
          previous.__wrapped__ = value;
          return result;
        }
        function wrapperReverse() {
          var value = this.__wrapped__;
          if (value instanceof LazyWrapper) {
            if (this.__actions__.length) {
              value = new LazyWrapper(this);
            }
            return new LodashWrapper(value.reverse(), this.__chain__);
          }
          return this.thru(function(value) {
            return value.reverse();
          });
        }
        function wrapperToString() {
          return (this.value() + '');
        }
        function wrapperValue() {
          return baseWrapperValue(this.__wrapped__, this.__actions__);
        }
        var at = restParam(function(collection, props) {
          return baseAt(collection, baseFlatten(props));
        });
        var countBy = createAggregator(function(result, value, key) {
          hasOwnProperty.call(result, key) ? ++result[key] : (result[key] = 1);
        });
        function every(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayEvery : baseEvery;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = null;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function filter(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, predicate);
        }
        var find = createFind(baseEach);
        var findLast = createFind(baseEachRight, true);
        function findWhere(collection, source) {
          return find(collection, baseMatches(source));
        }
        var forEach = createForEach(arrayEach, baseEach);
        var forEachRight = createForEach(arrayEachRight, baseEachRight);
        var groupBy = createAggregator(function(result, value, key) {
          if (hasOwnProperty.call(result, key)) {
            result[key].push(value);
          } else {
            result[key] = [value];
          }
        });
        function includes(collection, target, fromIndex, guard) {
          var length = collection ? getLength(collection) : 0;
          if (!isLength(length)) {
            collection = values(collection);
            length = collection.length;
          }
          if (!length) {
            return false;
          }
          if (typeof fromIndex != 'number' || (guard && isIterateeCall(target, fromIndex, guard))) {
            fromIndex = 0;
          } else {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : (fromIndex || 0);
          }
          return (typeof collection == 'string' || !isArray(collection) && isString(collection)) ? (fromIndex < length && collection.indexOf(target, fromIndex) > -1) : (getIndexOf(collection, target, fromIndex) > -1);
        }
        var indexBy = createAggregator(function(result, value, key) {
          result[key] = value;
        });
        var invoke = restParam(function(collection, path, args) {
          var index = -1,
              isFunc = typeof path == 'function',
              isProp = isKey(path),
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value) {
            var func = isFunc ? path : (isProp && value != null && value[path]);
            result[++index] = func ? func.apply(value, args) : invokePath(value, path, args);
          });
          return result;
        });
        function map(collection, iteratee, thisArg) {
          var func = isArray(collection) ? arrayMap : baseMap;
          iteratee = getCallback(iteratee, thisArg, 3);
          return func(collection, iteratee);
        }
        var partition = createAggregator(function(result, value, key) {
          result[key ? 0 : 1].push(value);
        }, function() {
          return [[], []];
        });
        function pluck(collection, path) {
          return map(collection, property(path));
        }
        var reduce = createReduce(arrayReduce, baseEach);
        var reduceRight = createReduce(arrayReduceRight, baseEachRight);
        function reject(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, function(value, index, collection) {
            return !predicate(value, index, collection);
          });
        }
        function sample(collection, n, guard) {
          if (guard ? isIterateeCall(collection, n, guard) : n == null) {
            collection = toIterable(collection);
            var length = collection.length;
            return length > 0 ? collection[baseRandom(0, length - 1)] : undefined;
          }
          var result = shuffle(collection);
          result.length = nativeMin(n < 0 ? 0 : (+n || 0), result.length);
          return result;
        }
        function shuffle(collection) {
          collection = toIterable(collection);
          var index = -1,
              length = collection.length,
              result = Array(length);
          while (++index < length) {
            var rand = baseRandom(0, index);
            if (index != rand) {
              result[index] = result[rand];
            }
            result[rand] = collection[index];
          }
          return result;
        }
        function size(collection) {
          var length = collection ? getLength(collection) : 0;
          return isLength(length) ? length : keys(collection).length;
        }
        function some(collection, predicate, thisArg) {
          var func = isArray(collection) ? arraySome : baseSome;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = null;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function sortBy(collection, iteratee, thisArg) {
          if (collection == null) {
            return [];
          }
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = null;
          }
          var index = -1;
          iteratee = getCallback(iteratee, thisArg, 3);
          var result = baseMap(collection, function(value, key, collection) {
            return {
              'criteria': iteratee(value, key, collection),
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, compareAscending);
        }
        var sortByAll = restParam(function(collection, iteratees) {
          if (collection == null) {
            return [];
          }
          var guard = iteratees[2];
          if (guard && isIterateeCall(iteratees[0], iteratees[1], guard)) {
            iteratees.length = 1;
          }
          return baseSortByOrder(collection, baseFlatten(iteratees), []);
        });
        function sortByOrder(collection, iteratees, orders, guard) {
          if (collection == null) {
            return [];
          }
          if (guard && isIterateeCall(iteratees, orders, guard)) {
            orders = null;
          }
          if (!isArray(iteratees)) {
            iteratees = iteratees == null ? [] : [iteratees];
          }
          if (!isArray(orders)) {
            orders = orders == null ? [] : [orders];
          }
          return baseSortByOrder(collection, iteratees, orders);
        }
        function where(collection, source) {
          return filter(collection, baseMatches(source));
        }
        var now = nativeNow || function() {
          return new Date().getTime();
        };
        function after(n, func) {
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          n = nativeIsFinite(n = +n) ? n : 0;
          return function() {
            if (--n < 1) {
              return func.apply(this, arguments);
            }
          };
        }
        function ary(func, n, guard) {
          if (guard && isIterateeCall(func, n, guard)) {
            n = null;
          }
          n = (func && n == null) ? func.length : nativeMax(+n || 0, 0);
          return createWrapper(func, ARY_FLAG, null, null, null, null, n);
        }
        function before(n, func) {
          var result;
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          return function() {
            if (--n > 0) {
              result = func.apply(this, arguments);
            }
            if (n <= 1) {
              func = null;
            }
            return result;
          };
        }
        var bind = restParam(function(func, thisArg, partials) {
          var bitmask = BIND_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bind.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(func, bitmask, thisArg, partials, holders);
        });
        var bindAll = restParam(function(object, methodNames) {
          methodNames = methodNames.length ? baseFlatten(methodNames) : functions(object);
          var index = -1,
              length = methodNames.length;
          while (++index < length) {
            var key = methodNames[index];
            object[key] = createWrapper(object[key], BIND_FLAG, object);
          }
          return object;
        });
        var bindKey = restParam(function(object, key, partials) {
          var bitmask = BIND_FLAG | BIND_KEY_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bindKey.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(key, bitmask, object, partials, holders);
        });
        var curry = createCurry(CURRY_FLAG);
        var curryRight = createCurry(CURRY_RIGHT_FLAG);
        function debounce(func, wait, options) {
          var args,
              maxTimeoutId,
              result,
              stamp,
              thisArg,
              timeoutId,
              trailingCall,
              lastCalled = 0,
              maxWait = false,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          wait = wait < 0 ? 0 : (+wait || 0);
          if (options === true) {
            var leading = true;
            trailing = false;
          } else if (isObject(options)) {
            leading = options.leading;
            maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
            trailing = 'trailing' in options ? options.trailing : trailing;
          }
          function cancel() {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            if (maxTimeoutId) {
              clearTimeout(maxTimeoutId);
            }
            maxTimeoutId = timeoutId = trailingCall = undefined;
          }
          function delayed() {
            var remaining = wait - (now() - stamp);
            if (remaining <= 0 || remaining > wait) {
              if (maxTimeoutId) {
                clearTimeout(maxTimeoutId);
              }
              var isCalled = trailingCall;
              maxTimeoutId = timeoutId = trailingCall = undefined;
              if (isCalled) {
                lastCalled = now();
                result = func.apply(thisArg, args);
                if (!timeoutId && !maxTimeoutId) {
                  args = thisArg = null;
                }
              }
            } else {
              timeoutId = setTimeout(delayed, remaining);
            }
          }
          function maxDelayed() {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            maxTimeoutId = timeoutId = trailingCall = undefined;
            if (trailing || (maxWait !== wait)) {
              lastCalled = now();
              result = func.apply(thisArg, args);
              if (!timeoutId && !maxTimeoutId) {
                args = thisArg = null;
              }
            }
          }
          function debounced() {
            args = arguments;
            stamp = now();
            thisArg = this;
            trailingCall = trailing && (timeoutId || !leading);
            if (maxWait === false) {
              var leadingCall = leading && !timeoutId;
            } else {
              if (!maxTimeoutId && !leading) {
                lastCalled = stamp;
              }
              var remaining = maxWait - (stamp - lastCalled),
                  isCalled = remaining <= 0 || remaining > maxWait;
              if (isCalled) {
                if (maxTimeoutId) {
                  maxTimeoutId = clearTimeout(maxTimeoutId);
                }
                lastCalled = stamp;
                result = func.apply(thisArg, args);
              } else if (!maxTimeoutId) {
                maxTimeoutId = setTimeout(maxDelayed, remaining);
              }
            }
            if (isCalled && timeoutId) {
              timeoutId = clearTimeout(timeoutId);
            } else if (!timeoutId && wait !== maxWait) {
              timeoutId = setTimeout(delayed, wait);
            }
            if (leadingCall) {
              isCalled = true;
              result = func.apply(thisArg, args);
            }
            if (isCalled && !timeoutId && !maxTimeoutId) {
              args = thisArg = null;
            }
            return result;
          }
          debounced.cancel = cancel;
          return debounced;
        }
        var defer = restParam(function(func, args) {
          return baseDelay(func, 1, args);
        });
        var delay = restParam(function(func, wait, args) {
          return baseDelay(func, wait, args);
        });
        var flow = createFlow();
        var flowRight = createFlow(true);
        function memoize(func, resolver) {
          if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var memoized = function() {
            var args = arguments,
                cache = memoized.cache,
                key = resolver ? resolver.apply(this, args) : args[0];
            if (cache.has(key)) {
              return cache.get(key);
            }
            var result = func.apply(this, args);
            cache.set(key, result);
            return result;
          };
          memoized.cache = new memoize.Cache;
          return memoized;
        }
        function negate(predicate) {
          if (typeof predicate != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function() {
            return !predicate.apply(this, arguments);
          };
        }
        function once(func) {
          return before(2, func);
        }
        var partial = createPartial(PARTIAL_FLAG);
        var partialRight = createPartial(PARTIAL_RIGHT_FLAG);
        var rearg = restParam(function(func, indexes) {
          return createWrapper(func, REARG_FLAG, null, null, null, baseFlatten(indexes));
        });
        function restParam(func, start) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
          return function() {
            var args = arguments,
                index = -1,
                length = nativeMax(args.length - start, 0),
                rest = Array(length);
            while (++index < length) {
              rest[index] = args[start + index];
            }
            switch (start) {
              case 0:
                return func.call(this, rest);
              case 1:
                return func.call(this, args[0], rest);
              case 2:
                return func.call(this, args[0], args[1], rest);
            }
            var otherArgs = Array(start + 1);
            index = -1;
            while (++index < start) {
              otherArgs[index] = args[index];
            }
            otherArgs[start] = rest;
            return func.apply(this, otherArgs);
          };
        }
        function spread(func) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function(array) {
            return func.apply(this, array);
          };
        }
        function throttle(func, wait, options) {
          var leading = true,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          if (options === false) {
            leading = false;
          } else if (isObject(options)) {
            leading = 'leading' in options ? !!options.leading : leading;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
          }
          debounceOptions.leading = leading;
          debounceOptions.maxWait = +wait;
          debounceOptions.trailing = trailing;
          return debounce(func, wait, debounceOptions);
        }
        function wrap(value, wrapper) {
          wrapper = wrapper == null ? identity : wrapper;
          return createWrapper(wrapper, PARTIAL_FLAG, null, [value], []);
        }
        function clone(value, isDeep, customizer, thisArg) {
          if (isDeep && typeof isDeep != 'boolean' && isIterateeCall(value, isDeep, customizer)) {
            isDeep = false;
          } else if (typeof isDeep == 'function') {
            thisArg = customizer;
            customizer = isDeep;
            isDeep = false;
          }
          customizer = typeof customizer == 'function' && bindCallback(customizer, thisArg, 1);
          return baseClone(value, isDeep, customizer);
        }
        function cloneDeep(value, customizer, thisArg) {
          customizer = typeof customizer == 'function' && bindCallback(customizer, thisArg, 1);
          return baseClone(value, true, customizer);
        }
        function isArguments(value) {
          return isObjectLike(value) && isArrayLike(value) && objToString.call(value) == argsTag;
        }
        var isArray = nativeIsArray || function(value) {
          return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
        };
        function isBoolean(value) {
          return value === true || value === false || (isObjectLike(value) && objToString.call(value) == boolTag);
        }
        function isDate(value) {
          return isObjectLike(value) && objToString.call(value) == dateTag;
        }
        function isElement(value) {
          return !!value && value.nodeType === 1 && isObjectLike(value) && (objToString.call(value).indexOf('Element') > -1);
        }
        if (!support.dom) {
          isElement = function(value) {
            return !!value && value.nodeType === 1 && isObjectLike(value) && !isPlainObject(value);
          };
        }
        function isEmpty(value) {
          if (value == null) {
            return true;
          }
          if (isArrayLike(value) && (isArray(value) || isString(value) || isArguments(value) || (isObjectLike(value) && isFunction(value.splice)))) {
            return !value.length;
          }
          return !keys(value).length;
        }
        function isEqual(value, other, customizer, thisArg) {
          customizer = typeof customizer == 'function' && bindCallback(customizer, thisArg, 3);
          if (!customizer && isStrictComparable(value) && isStrictComparable(other)) {
            return value === other;
          }
          var result = customizer ? customizer(value, other) : undefined;
          return result === undefined ? baseIsEqual(value, other, customizer) : !!result;
        }
        function isError(value) {
          return isObjectLike(value) && typeof value.message == 'string' && objToString.call(value) == errorTag;
        }
        var isFinite = nativeNumIsFinite || function(value) {
          return typeof value == 'number' && nativeIsFinite(value);
        };
        var isFunction = !(baseIsFunction(/x/) || (Uint8Array && !baseIsFunction(Uint8Array))) ? baseIsFunction : function(value) {
          return objToString.call(value) == funcTag;
        };
        function isObject(value) {
          var type = typeof value;
          return type == 'function' || (!!value && type == 'object');
        }
        function isMatch(object, source, customizer, thisArg) {
          var props = keys(source),
              length = props.length;
          if (!length) {
            return true;
          }
          if (object == null) {
            return false;
          }
          customizer = typeof customizer == 'function' && bindCallback(customizer, thisArg, 3);
          object = toObject(object);
          if (!customizer && length == 1) {
            var key = props[0],
                value = source[key];
            if (isStrictComparable(value)) {
              return value === object[key] && (value !== undefined || (key in object));
            }
          }
          var values = Array(length),
              strictCompareFlags = Array(length);
          while (length--) {
            value = values[length] = source[props[length]];
            strictCompareFlags[length] = isStrictComparable(value);
          }
          return baseIsMatch(object, props, values, strictCompareFlags, customizer);
        }
        function isNaN(value) {
          return isNumber(value) && value != +value;
        }
        function isNative(value) {
          if (value == null) {
            return false;
          }
          if (objToString.call(value) == funcTag) {
            return reIsNative.test(fnToString.call(value));
          }
          return isObjectLike(value) && reIsHostCtor.test(value);
        }
        function isNull(value) {
          return value === null;
        }
        function isNumber(value) {
          return typeof value == 'number' || (isObjectLike(value) && objToString.call(value) == numberTag);
        }
        var isPlainObject = !getPrototypeOf ? shimIsPlainObject : function(value) {
          if (!(value && objToString.call(value) == objectTag)) {
            return false;
          }
          var valueOf = value.valueOf,
              objProto = isNative(valueOf) && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);
          return objProto ? (value == objProto || getPrototypeOf(value) == objProto) : shimIsPlainObject(value);
        };
        function isRegExp(value) {
          return isObjectLike(value) && objToString.call(value) == regexpTag;
        }
        function isString(value) {
          return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
        }
        function isTypedArray(value) {
          return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
        }
        function isUndefined(value) {
          return value === undefined;
        }
        function toArray(value) {
          var length = value ? getLength(value) : 0;
          if (!isLength(length)) {
            return values(value);
          }
          if (!length) {
            return [];
          }
          return arrayCopy(value);
        }
        function toPlainObject(value) {
          return baseCopy(value, keysIn(value));
        }
        var assign = createAssigner(function(object, source, customizer) {
          return customizer ? assignWith(object, source, customizer) : baseAssign(object, source);
        });
        function create(prototype, properties, guard) {
          var result = baseCreate(prototype);
          if (guard && isIterateeCall(prototype, properties, guard)) {
            properties = null;
          }
          return properties ? baseAssign(result, properties) : result;
        }
        var defaults = restParam(function(args) {
          var object = args[0];
          if (object == null) {
            return object;
          }
          args.push(assignDefaults);
          return assign.apply(undefined, args);
        });
        var findKey = createFindKey(baseForOwn);
        var findLastKey = createFindKey(baseForOwnRight);
        var forIn = createForIn(baseFor);
        var forInRight = createForIn(baseForRight);
        var forOwn = createForOwn(baseForOwn);
        var forOwnRight = createForOwn(baseForOwnRight);
        function functions(object) {
          return baseFunctions(object, keysIn(object));
        }
        function get(object, path, defaultValue) {
          var result = object == null ? undefined : baseGet(object, toPath(path), path + '');
          return result === undefined ? defaultValue : result;
        }
        function has(object, path) {
          if (object == null) {
            return false;
          }
          var result = hasOwnProperty.call(object, path);
          if (!result && !isKey(path)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            path = last(path);
            result = object != null && hasOwnProperty.call(object, path);
          }
          return result;
        }
        function invert(object, multiValue, guard) {
          if (guard && isIterateeCall(object, multiValue, guard)) {
            multiValue = null;
          }
          var index = -1,
              props = keys(object),
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index],
                value = object[key];
            if (multiValue) {
              if (hasOwnProperty.call(result, value)) {
                result[value].push(key);
              } else {
                result[value] = [key];
              }
            } else {
              result[value] = key;
            }
          }
          return result;
        }
        var keys = !nativeKeys ? shimKeys : function(object) {
          var Ctor = object != null && object.constructor;
          if ((typeof Ctor == 'function' && Ctor.prototype === object) || (typeof object != 'function' && isArrayLike(object))) {
            return shimKeys(object);
          }
          return isObject(object) ? nativeKeys(object) : [];
        };
        function keysIn(object) {
          if (object == null) {
            return [];
          }
          if (!isObject(object)) {
            object = Object(object);
          }
          var length = object.length;
          length = (length && isLength(length) && (isArray(object) || (support.nonEnumArgs && isArguments(object))) && length) || 0;
          var Ctor = object.constructor,
              index = -1,
              isProto = typeof Ctor == 'function' && Ctor.prototype === object,
              result = Array(length),
              skipIndexes = length > 0;
          while (++index < length) {
            result[index] = (index + '');
          }
          for (var key in object) {
            if (!(skipIndexes && isIndex(key, length)) && !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
              result.push(key);
            }
          }
          return result;
        }
        var mapKeys = createObjectMapper(true);
        var mapValues = createObjectMapper();
        var merge = createAssigner(baseMerge);
        var omit = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          if (typeof props[0] != 'function') {
            var props = arrayMap(baseFlatten(props), String);
            return pickByArray(object, baseDifference(keysIn(object), props));
          }
          var predicate = bindCallback(props[0], props[1], 3);
          return pickByCallback(object, function(value, key, object) {
            return !predicate(value, key, object);
          });
        });
        function pairs(object) {
          var index = -1,
              props = keys(object),
              length = props.length,
              result = Array(length);
          while (++index < length) {
            var key = props[index];
            result[index] = [key, object[key]];
          }
          return result;
        }
        var pick = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          return typeof props[0] == 'function' ? pickByCallback(object, bindCallback(props[0], props[1], 3)) : pickByArray(object, baseFlatten(props));
        });
        function result(object, path, defaultValue) {
          var result = object == null ? undefined : object[path];
          if (result === undefined) {
            if (object != null && !isKey(path, object)) {
              path = toPath(path);
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              result = object == null ? undefined : object[last(path)];
            }
            result = result === undefined ? defaultValue : result;
          }
          return isFunction(result) ? result.call(object) : result;
        }
        function set(object, path, value) {
          if (object == null) {
            return object;
          }
          var pathKey = (path + '');
          path = (object[pathKey] != null || isKey(path, object)) ? [pathKey] : toPath(path);
          var index = -1,
              length = path.length,
              endIndex = length - 1,
              nested = object;
          while (nested != null && ++index < length) {
            var key = path[index];
            if (isObject(nested)) {
              if (index == endIndex) {
                nested[key] = value;
              } else if (nested[key] == null) {
                nested[key] = isIndex(path[index + 1]) ? [] : {};
              }
            }
            nested = nested[key];
          }
          return object;
        }
        function transform(object, iteratee, accumulator, thisArg) {
          var isArr = isArray(object) || isTypedArray(object);
          iteratee = getCallback(iteratee, thisArg, 4);
          if (accumulator == null) {
            if (isArr || isObject(object)) {
              var Ctor = object.constructor;
              if (isArr) {
                accumulator = isArray(object) ? new Ctor : [];
              } else {
                accumulator = baseCreate(isFunction(Ctor) && Ctor.prototype);
              }
            } else {
              accumulator = {};
            }
          }
          (isArr ? arrayEach : baseForOwn)(object, function(value, index, object) {
            return iteratee(accumulator, value, index, object);
          });
          return accumulator;
        }
        function values(object) {
          return baseValues(object, keys(object));
        }
        function valuesIn(object) {
          return baseValues(object, keysIn(object));
        }
        function inRange(value, start, end) {
          start = +start || 0;
          if (typeof end === 'undefined') {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          return value >= nativeMin(start, end) && value < nativeMax(start, end);
        }
        function random(min, max, floating) {
          if (floating && isIterateeCall(min, max, floating)) {
            max = floating = null;
          }
          var noMin = min == null,
              noMax = max == null;
          if (floating == null) {
            if (noMax && typeof min == 'boolean') {
              floating = min;
              min = 1;
            } else if (typeof max == 'boolean') {
              floating = max;
              noMax = true;
            }
          }
          if (noMin && noMax) {
            max = 1;
            noMax = false;
          }
          min = +min || 0;
          if (noMax) {
            max = min;
            min = 0;
          } else {
            max = +max || 0;
          }
          if (floating || min % 1 || max % 1) {
            var rand = nativeRandom();
            return nativeMin(min + (rand * (max - min + parseFloat('1e-' + ((rand + '').length - 1)))), max);
          }
          return baseRandom(min, max);
        }
        var camelCase = createCompounder(function(result, word, index) {
          word = word.toLowerCase();
          return result + (index ? (word.charAt(0).toUpperCase() + word.slice(1)) : word);
        });
        function capitalize(string) {
          string = baseToString(string);
          return string && (string.charAt(0).toUpperCase() + string.slice(1));
        }
        function deburr(string) {
          string = baseToString(string);
          return string && string.replace(reLatin1, deburrLetter).replace(reComboMark, '');
        }
        function endsWith(string, target, position) {
          string = baseToString(string);
          target = (target + '');
          var length = string.length;
          position = position === undefined ? length : nativeMin(position < 0 ? 0 : (+position || 0), length);
          position -= target.length;
          return position >= 0 && string.indexOf(target, position) == position;
        }
        function escape(string) {
          string = baseToString(string);
          return (string && reHasUnescapedHtml.test(string)) ? string.replace(reUnescapedHtml, escapeHtmlChar) : string;
        }
        function escapeRegExp(string) {
          string = baseToString(string);
          return (string && reHasRegExpChars.test(string)) ? string.replace(reRegExpChars, '\\$&') : string;
        }
        var kebabCase = createCompounder(function(result, word, index) {
          return result + (index ? '-' : '') + word.toLowerCase();
        });
        function pad(string, length, chars) {
          string = baseToString(string);
          length = +length;
          var strLength = string.length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return string;
          }
          var mid = (length - strLength) / 2,
              leftLength = floor(mid),
              rightLength = ceil(mid);
          chars = createPadding('', rightLength, chars);
          return chars.slice(0, leftLength) + string + chars;
        }
        var padLeft = createPadDir();
        var padRight = createPadDir(true);
        function parseInt(string, radix, guard) {
          if (guard && isIterateeCall(string, radix, guard)) {
            radix = 0;
          }
          return nativeParseInt(string, radix);
        }
        if (nativeParseInt(whitespace + '08') != 8) {
          parseInt = function(string, radix, guard) {
            if (guard ? isIterateeCall(string, radix, guard) : radix == null) {
              radix = 0;
            } else if (radix) {
              radix = +radix;
            }
            string = trim(string);
            return nativeParseInt(string, radix || (reHasHexPrefix.test(string) ? 16 : 10));
          };
        }
        function repeat(string, n) {
          var result = '';
          string = baseToString(string);
          n = +n;
          if (n < 1 || !string || !nativeIsFinite(n)) {
            return result;
          }
          do {
            if (n % 2) {
              result += string;
            }
            n = floor(n / 2);
            string += string;
          } while (n);
          return result;
        }
        var snakeCase = createCompounder(function(result, word, index) {
          return result + (index ? '_' : '') + word.toLowerCase();
        });
        var startCase = createCompounder(function(result, word, index) {
          return result + (index ? ' ' : '') + (word.charAt(0).toUpperCase() + word.slice(1));
        });
        function startsWith(string, target, position) {
          string = baseToString(string);
          position = position == null ? 0 : nativeMin(position < 0 ? 0 : (+position || 0), string.length);
          return string.lastIndexOf(target, position) == position;
        }
        function template(string, options, otherOptions) {
          var settings = lodash.templateSettings;
          if (otherOptions && isIterateeCall(string, options, otherOptions)) {
            options = otherOptions = null;
          }
          string = baseToString(string);
          options = assignWith(baseAssign({}, otherOptions || options), settings, assignOwnDefaults);
          var imports = assignWith(baseAssign({}, options.imports), settings.imports, assignOwnDefaults),
              importsKeys = keys(imports),
              importsValues = baseValues(imports, importsKeys);
          var isEscaping,
              isEvaluating,
              index = 0,
              interpolate = options.interpolate || reNoMatch,
              source = "__p += '";
          var reDelimiters = RegExp((options.escape || reNoMatch).source + '|' + interpolate.source + '|' + (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' + (options.evaluate || reNoMatch).source + '|$', 'g');
          var sourceURL = '//# sourceURL=' + ('sourceURL' in options ? options.sourceURL : ('lodash.templateSources[' + (++templateCounter) + ']')) + '\n';
          string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
            interpolateValue || (interpolateValue = esTemplateValue);
            source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
            if (escapeValue) {
              isEscaping = true;
              source += "' +\n__e(" + escapeValue + ") +\n'";
            }
            if (evaluateValue) {
              isEvaluating = true;
              source += "';\n" + evaluateValue + ";\n__p += '";
            }
            if (interpolateValue) {
              source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
            }
            index = offset + match.length;
            return match;
          });
          source += "';\n";
          var variable = options.variable;
          if (!variable) {
            source = 'with (obj) {\n' + source + '\n}\n';
          }
          source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source).replace(reEmptyStringMiddle, '$1').replace(reEmptyStringTrailing, '$1;');
          source = 'function(' + (variable || 'obj') + ') {\n' + (variable ? '' : 'obj || (obj = {});\n') + "var __t, __p = ''" + (isEscaping ? ', __e = _.escape' : '') + (isEvaluating ? ', __j = Array.prototype.join;\n' + "function print() { __p += __j.call(arguments, '') }\n" : ';\n') + source + 'return __p\n}';
          var result = attempt(function() {
            return Function(importsKeys, sourceURL + 'return ' + source).apply(undefined, importsValues);
          });
          result.source = source;
          if (isError(result)) {
            throw result;
          }
          return result;
        }
        function trim(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string), trimmedRightIndex(string) + 1);
          }
          chars = (chars + '');
          return string.slice(charsLeftIndex(string, chars), charsRightIndex(string, chars) + 1);
        }
        function trimLeft(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string));
          }
          return string.slice(charsLeftIndex(string, (chars + '')));
        }
        function trimRight(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(0, trimmedRightIndex(string) + 1);
          }
          return string.slice(0, charsRightIndex(string, (chars + '')) + 1);
        }
        function trunc(string, options, guard) {
          if (guard && isIterateeCall(string, options, guard)) {
            options = null;
          }
          var length = DEFAULT_TRUNC_LENGTH,
              omission = DEFAULT_TRUNC_OMISSION;
          if (options != null) {
            if (isObject(options)) {
              var separator = 'separator' in options ? options.separator : separator;
              length = 'length' in options ? (+options.length || 0) : length;
              omission = 'omission' in options ? baseToString(options.omission) : omission;
            } else {
              length = +options || 0;
            }
          }
          string = baseToString(string);
          if (length >= string.length) {
            return string;
          }
          var end = length - omission.length;
          if (end < 1) {
            return omission;
          }
          var result = string.slice(0, end);
          if (separator == null) {
            return result + omission;
          }
          if (isRegExp(separator)) {
            if (string.slice(end).search(separator)) {
              var match,
                  newEnd,
                  substring = string.slice(0, end);
              if (!separator.global) {
                separator = RegExp(separator.source, (reFlags.exec(separator) || '') + 'g');
              }
              separator.lastIndex = 0;
              while ((match = separator.exec(substring))) {
                newEnd = match.index;
              }
              result = result.slice(0, newEnd == null ? end : newEnd);
            }
          } else if (string.indexOf(separator, end) != end) {
            var index = result.lastIndexOf(separator);
            if (index > -1) {
              result = result.slice(0, index);
            }
          }
          return result + omission;
        }
        function unescape(string) {
          string = baseToString(string);
          return (string && reHasEscapedHtml.test(string)) ? string.replace(reEscapedHtml, unescapeHtmlChar) : string;
        }
        function words(string, pattern, guard) {
          if (guard && isIterateeCall(string, pattern, guard)) {
            pattern = null;
          }
          string = baseToString(string);
          return string.match(pattern || reWords) || [];
        }
        var attempt = restParam(function(func, args) {
          try {
            return func.apply(undefined, args);
          } catch (e) {
            return isError(e) ? e : new Error(e);
          }
        });
        function callback(func, thisArg, guard) {
          if (guard && isIterateeCall(func, thisArg, guard)) {
            thisArg = null;
          }
          return isObjectLike(func) ? matches(func) : baseCallback(func, thisArg);
        }
        function constant(value) {
          return function() {
            return value;
          };
        }
        function identity(value) {
          return value;
        }
        function matches(source) {
          return baseMatches(baseClone(source, true));
        }
        function matchesProperty(path, value) {
          return baseMatchesProperty(path, baseClone(value, true));
        }
        var method = restParam(function(path, args) {
          return function(object) {
            return invokePath(object, path, args);
          };
        });
        var methodOf = restParam(function(object, args) {
          return function(path) {
            return invokePath(object, path, args);
          };
        });
        function mixin(object, source, options) {
          if (options == null) {
            var isObj = isObject(source),
                props = isObj && keys(source),
                methodNames = props && props.length && baseFunctions(source, props);
            if (!(methodNames ? methodNames.length : isObj)) {
              methodNames = false;
              options = source;
              source = object;
              object = this;
            }
          }
          if (!methodNames) {
            methodNames = baseFunctions(source, keys(source));
          }
          var chain = true,
              index = -1,
              isFunc = isFunction(object),
              length = methodNames.length;
          if (options === false) {
            chain = false;
          } else if (isObject(options) && 'chain' in options) {
            chain = options.chain;
          }
          while (++index < length) {
            var methodName = methodNames[index],
                func = source[methodName];
            object[methodName] = func;
            if (isFunc) {
              object.prototype[methodName] = (function(func) {
                return function() {
                  var chainAll = this.__chain__;
                  if (chain || chainAll) {
                    var result = object(this.__wrapped__),
                        actions = result.__actions__ = arrayCopy(this.__actions__);
                    actions.push({
                      'func': func,
                      'args': arguments,
                      'thisArg': object
                    });
                    result.__chain__ = chainAll;
                    return result;
                  }
                  var args = [this.value()];
                  push.apply(args, arguments);
                  return func.apply(object, args);
                };
              }(func));
            }
          }
          return object;
        }
        function noConflict() {
          context._ = oldDash;
          return this;
        }
        function noop() {}
        function property(path) {
          return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
        }
        function propertyOf(object) {
          return function(path) {
            return baseGet(object, toPath(path), path + '');
          };
        }
        function range(start, end, step) {
          if (step && isIterateeCall(start, end, step)) {
            end = step = null;
          }
          start = +start || 0;
          step = step == null ? 1 : (+step || 0);
          if (end == null) {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          var index = -1,
              length = nativeMax(ceil((end - start) / (step || 1)), 0),
              result = Array(length);
          while (++index < length) {
            result[index] = start;
            start += step;
          }
          return result;
        }
        function times(n, iteratee, thisArg) {
          n = floor(n);
          if (n < 1 || !nativeIsFinite(n)) {
            return [];
          }
          var index = -1,
              result = Array(nativeMin(n, MAX_ARRAY_LENGTH));
          iteratee = bindCallback(iteratee, thisArg, 1);
          while (++index < n) {
            if (index < MAX_ARRAY_LENGTH) {
              result[index] = iteratee(index);
            } else {
              iteratee(index);
            }
          }
          return result;
        }
        function uniqueId(prefix) {
          var id = ++idCounter;
          return baseToString(prefix) + id;
        }
        function add(augend, addend) {
          return (+augend || 0) + (+addend || 0);
        }
        var max = createExtremum(arrayMax);
        var min = createExtremum(arrayMin, true);
        function sum(collection, iteratee, thisArg) {
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = null;
          }
          var func = getCallback(),
              noIteratee = iteratee == null;
          if (!(func === baseCallback && noIteratee)) {
            noIteratee = false;
            iteratee = func(iteratee, thisArg, 3);
          }
          return noIteratee ? arraySum(isArray(collection) ? collection : toIterable(collection)) : baseSum(collection, iteratee);
        }
        lodash.prototype = baseLodash.prototype;
        LodashWrapper.prototype = baseCreate(baseLodash.prototype);
        LodashWrapper.prototype.constructor = LodashWrapper;
        LazyWrapper.prototype = baseCreate(baseLodash.prototype);
        LazyWrapper.prototype.constructor = LazyWrapper;
        MapCache.prototype['delete'] = mapDelete;
        MapCache.prototype.get = mapGet;
        MapCache.prototype.has = mapHas;
        MapCache.prototype.set = mapSet;
        SetCache.prototype.push = cachePush;
        memoize.Cache = MapCache;
        lodash.after = after;
        lodash.ary = ary;
        lodash.assign = assign;
        lodash.at = at;
        lodash.before = before;
        lodash.bind = bind;
        lodash.bindAll = bindAll;
        lodash.bindKey = bindKey;
        lodash.callback = callback;
        lodash.chain = chain;
        lodash.chunk = chunk;
        lodash.compact = compact;
        lodash.constant = constant;
        lodash.countBy = countBy;
        lodash.create = create;
        lodash.curry = curry;
        lodash.curryRight = curryRight;
        lodash.debounce = debounce;
        lodash.defaults = defaults;
        lodash.defer = defer;
        lodash.delay = delay;
        lodash.difference = difference;
        lodash.drop = drop;
        lodash.dropRight = dropRight;
        lodash.dropRightWhile = dropRightWhile;
        lodash.dropWhile = dropWhile;
        lodash.fill = fill;
        lodash.filter = filter;
        lodash.flatten = flatten;
        lodash.flattenDeep = flattenDeep;
        lodash.flow = flow;
        lodash.flowRight = flowRight;
        lodash.forEach = forEach;
        lodash.forEachRight = forEachRight;
        lodash.forIn = forIn;
        lodash.forInRight = forInRight;
        lodash.forOwn = forOwn;
        lodash.forOwnRight = forOwnRight;
        lodash.functions = functions;
        lodash.groupBy = groupBy;
        lodash.indexBy = indexBy;
        lodash.initial = initial;
        lodash.intersection = intersection;
        lodash.invert = invert;
        lodash.invoke = invoke;
        lodash.keys = keys;
        lodash.keysIn = keysIn;
        lodash.map = map;
        lodash.mapKeys = mapKeys;
        lodash.mapValues = mapValues;
        lodash.matches = matches;
        lodash.matchesProperty = matchesProperty;
        lodash.memoize = memoize;
        lodash.merge = merge;
        lodash.method = method;
        lodash.methodOf = methodOf;
        lodash.mixin = mixin;
        lodash.negate = negate;
        lodash.omit = omit;
        lodash.once = once;
        lodash.pairs = pairs;
        lodash.partial = partial;
        lodash.partialRight = partialRight;
        lodash.partition = partition;
        lodash.pick = pick;
        lodash.pluck = pluck;
        lodash.property = property;
        lodash.propertyOf = propertyOf;
        lodash.pull = pull;
        lodash.pullAt = pullAt;
        lodash.range = range;
        lodash.rearg = rearg;
        lodash.reject = reject;
        lodash.remove = remove;
        lodash.rest = rest;
        lodash.restParam = restParam;
        lodash.set = set;
        lodash.shuffle = shuffle;
        lodash.slice = slice;
        lodash.sortBy = sortBy;
        lodash.sortByAll = sortByAll;
        lodash.sortByOrder = sortByOrder;
        lodash.spread = spread;
        lodash.take = take;
        lodash.takeRight = takeRight;
        lodash.takeRightWhile = takeRightWhile;
        lodash.takeWhile = takeWhile;
        lodash.tap = tap;
        lodash.throttle = throttle;
        lodash.thru = thru;
        lodash.times = times;
        lodash.toArray = toArray;
        lodash.toPlainObject = toPlainObject;
        lodash.transform = transform;
        lodash.union = union;
        lodash.uniq = uniq;
        lodash.unzip = unzip;
        lodash.unzipWith = unzipWith;
        lodash.values = values;
        lodash.valuesIn = valuesIn;
        lodash.where = where;
        lodash.without = without;
        lodash.wrap = wrap;
        lodash.xor = xor;
        lodash.zip = zip;
        lodash.zipObject = zipObject;
        lodash.zipWith = zipWith;
        lodash.backflow = flowRight;
        lodash.collect = map;
        lodash.compose = flowRight;
        lodash.each = forEach;
        lodash.eachRight = forEachRight;
        lodash.extend = assign;
        lodash.iteratee = callback;
        lodash.methods = functions;
        lodash.object = zipObject;
        lodash.select = filter;
        lodash.tail = rest;
        lodash.unique = uniq;
        mixin(lodash, lodash);
        lodash.add = add;
        lodash.attempt = attempt;
        lodash.camelCase = camelCase;
        lodash.capitalize = capitalize;
        lodash.clone = clone;
        lodash.cloneDeep = cloneDeep;
        lodash.deburr = deburr;
        lodash.endsWith = endsWith;
        lodash.escape = escape;
        lodash.escapeRegExp = escapeRegExp;
        lodash.every = every;
        lodash.find = find;
        lodash.findIndex = findIndex;
        lodash.findKey = findKey;
        lodash.findLast = findLast;
        lodash.findLastIndex = findLastIndex;
        lodash.findLastKey = findLastKey;
        lodash.findWhere = findWhere;
        lodash.first = first;
        lodash.get = get;
        lodash.has = has;
        lodash.identity = identity;
        lodash.includes = includes;
        lodash.indexOf = indexOf;
        lodash.inRange = inRange;
        lodash.isArguments = isArguments;
        lodash.isArray = isArray;
        lodash.isBoolean = isBoolean;
        lodash.isDate = isDate;
        lodash.isElement = isElement;
        lodash.isEmpty = isEmpty;
        lodash.isEqual = isEqual;
        lodash.isError = isError;
        lodash.isFinite = isFinite;
        lodash.isFunction = isFunction;
        lodash.isMatch = isMatch;
        lodash.isNaN = isNaN;
        lodash.isNative = isNative;
        lodash.isNull = isNull;
        lodash.isNumber = isNumber;
        lodash.isObject = isObject;
        lodash.isPlainObject = isPlainObject;
        lodash.isRegExp = isRegExp;
        lodash.isString = isString;
        lodash.isTypedArray = isTypedArray;
        lodash.isUndefined = isUndefined;
        lodash.kebabCase = kebabCase;
        lodash.last = last;
        lodash.lastIndexOf = lastIndexOf;
        lodash.max = max;
        lodash.min = min;
        lodash.noConflict = noConflict;
        lodash.noop = noop;
        lodash.now = now;
        lodash.pad = pad;
        lodash.padLeft = padLeft;
        lodash.padRight = padRight;
        lodash.parseInt = parseInt;
        lodash.random = random;
        lodash.reduce = reduce;
        lodash.reduceRight = reduceRight;
        lodash.repeat = repeat;
        lodash.result = result;
        lodash.runInContext = runInContext;
        lodash.size = size;
        lodash.snakeCase = snakeCase;
        lodash.some = some;
        lodash.sortedIndex = sortedIndex;
        lodash.sortedLastIndex = sortedLastIndex;
        lodash.startCase = startCase;
        lodash.startsWith = startsWith;
        lodash.sum = sum;
        lodash.template = template;
        lodash.trim = trim;
        lodash.trimLeft = trimLeft;
        lodash.trimRight = trimRight;
        lodash.trunc = trunc;
        lodash.unescape = unescape;
        lodash.uniqueId = uniqueId;
        lodash.words = words;
        lodash.all = every;
        lodash.any = some;
        lodash.contains = includes;
        lodash.detect = find;
        lodash.foldl = reduce;
        lodash.foldr = reduceRight;
        lodash.head = first;
        lodash.include = includes;
        lodash.inject = reduce;
        mixin(lodash, (function() {
          var source = {};
          baseForOwn(lodash, function(func, methodName) {
            if (!lodash.prototype[methodName]) {
              source[methodName] = func;
            }
          });
          return source;
        }()), false);
        lodash.sample = sample;
        lodash.prototype.sample = function(n) {
          if (!this.__chain__ && n == null) {
            return sample(this.value());
          }
          return this.thru(function(value) {
            return sample(value, n);
          });
        };
        lodash.VERSION = VERSION;
        arrayEach(['bind', 'bindKey', 'curry', 'curryRight', 'partial', 'partialRight'], function(methodName) {
          lodash[methodName].placeholder = lodash;
        });
        arrayEach(['dropWhile', 'filter', 'map', 'takeWhile'], function(methodName, type) {
          var isFilter = type != LAZY_MAP_FLAG,
              isDropWhile = type == LAZY_DROP_WHILE_FLAG;
          LazyWrapper.prototype[methodName] = function(iteratee, thisArg) {
            var filtered = this.__filtered__,
                result = (filtered && isDropWhile) ? new LazyWrapper(this) : this.clone(),
                iteratees = result.__iteratees__ || (result.__iteratees__ = []);
            iteratees.push({
              'done': false,
              'count': 0,
              'index': 0,
              'iteratee': getCallback(iteratee, thisArg, 1),
              'limit': -1,
              'type': type
            });
            result.__filtered__ = filtered || isFilter;
            return result;
          };
        });
        arrayEach(['drop', 'take'], function(methodName, index) {
          var whileName = methodName + 'While';
          LazyWrapper.prototype[methodName] = function(n) {
            var filtered = this.__filtered__,
                result = (filtered && !index) ? this.dropWhile() : this.clone();
            n = n == null ? 1 : nativeMax(floor(n) || 0, 0);
            if (filtered) {
              if (index) {
                result.__takeCount__ = nativeMin(result.__takeCount__, n);
              } else {
                last(result.__iteratees__).limit = n;
              }
            } else {
              var views = result.__views__ || (result.__views__ = []);
              views.push({
                'size': n,
                'type': methodName + (result.__dir__ < 0 ? 'Right' : '')
              });
            }
            return result;
          };
          LazyWrapper.prototype[methodName + 'Right'] = function(n) {
            return this.reverse()[methodName](n).reverse();
          };
          LazyWrapper.prototype[methodName + 'RightWhile'] = function(predicate, thisArg) {
            return this.reverse()[whileName](predicate, thisArg).reverse();
          };
        });
        arrayEach(['first', 'last'], function(methodName, index) {
          var takeName = 'take' + (index ? 'Right' : '');
          LazyWrapper.prototype[methodName] = function() {
            return this[takeName](1).value()[0];
          };
        });
        arrayEach(['initial', 'rest'], function(methodName, index) {
          var dropName = 'drop' + (index ? '' : 'Right');
          LazyWrapper.prototype[methodName] = function() {
            return this[dropName](1);
          };
        });
        arrayEach(['pluck', 'where'], function(methodName, index) {
          var operationName = index ? 'filter' : 'map',
              createCallback = index ? baseMatches : property;
          LazyWrapper.prototype[methodName] = function(value) {
            return this[operationName](createCallback(value));
          };
        });
        LazyWrapper.prototype.compact = function() {
          return this.filter(identity);
        };
        LazyWrapper.prototype.reject = function(predicate, thisArg) {
          predicate = getCallback(predicate, thisArg, 1);
          return this.filter(function(value) {
            return !predicate(value);
          });
        };
        LazyWrapper.prototype.slice = function(start, end) {
          start = start == null ? 0 : (+start || 0);
          var result = this;
          if (start < 0) {
            result = this.takeRight(-start);
          } else if (start) {
            result = this.drop(start);
          }
          if (end !== undefined) {
            end = (+end || 0);
            result = end < 0 ? result.dropRight(-end) : result.take(end - start);
          }
          return result;
        };
        LazyWrapper.prototype.toArray = function() {
          return this.drop(0);
        };
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var lodashFunc = lodash[methodName];
          if (!lodashFunc) {
            return ;
          }
          var checkIteratee = /^(?:filter|map|reject)|While$/.test(methodName),
              retUnwrapped = /^(?:first|last)$/.test(methodName);
          lodash.prototype[methodName] = function() {
            var args = arguments,
                chainAll = this.__chain__,
                value = this.__wrapped__,
                isHybrid = !!this.__actions__.length,
                isLazy = value instanceof LazyWrapper,
                iteratee = args[0],
                useLazy = isLazy || isArray(value);
            if (useLazy && checkIteratee && typeof iteratee == 'function' && iteratee.length != 1) {
              isLazy = useLazy = false;
            }
            var onlyLazy = isLazy && !isHybrid;
            if (retUnwrapped && !chainAll) {
              return onlyLazy ? func.call(value) : lodashFunc.call(lodash, this.value());
            }
            var interceptor = function(value) {
              var otherArgs = [value];
              push.apply(otherArgs, args);
              return lodashFunc.apply(lodash, otherArgs);
            };
            if (useLazy) {
              var wrapper = onlyLazy ? value : new LazyWrapper(this),
                  result = func.apply(wrapper, args);
              if (!retUnwrapped && (isHybrid || result.__actions__)) {
                var actions = result.__actions__ || (result.__actions__ = []);
                actions.push({
                  'func': thru,
                  'args': [interceptor],
                  'thisArg': lodash
                });
              }
              return new LodashWrapper(result, chainAll);
            }
            return this.thru(interceptor);
          };
        });
        arrayEach(['concat', 'join', 'pop', 'push', 'replace', 'shift', 'sort', 'splice', 'split', 'unshift'], function(methodName) {
          var func = (/^(?:replace|split)$/.test(methodName) ? stringProto : arrayProto)[methodName],
              chainName = /^(?:push|sort|unshift)$/.test(methodName) ? 'tap' : 'thru',
              retUnwrapped = /^(?:join|pop|replace|shift)$/.test(methodName);
          lodash.prototype[methodName] = function() {
            var args = arguments;
            if (retUnwrapped && !this.__chain__) {
              return func.apply(this.value(), args);
            }
            return this[chainName](function(value) {
              return func.apply(value, args);
            });
          };
        });
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var lodashFunc = lodash[methodName];
          if (lodashFunc) {
            var key = lodashFunc.name,
                names = realNames[key] || (realNames[key] = []);
            names.push({
              'name': methodName,
              'func': lodashFunc
            });
          }
        });
        realNames[createHybridWrapper(null, BIND_KEY_FLAG).name] = [{
          'name': 'wrapper',
          'func': null
        }];
        LazyWrapper.prototype.clone = lazyClone;
        LazyWrapper.prototype.reverse = lazyReverse;
        LazyWrapper.prototype.value = lazyValue;
        lodash.prototype.chain = wrapperChain;
        lodash.prototype.commit = wrapperCommit;
        lodash.prototype.plant = wrapperPlant;
        lodash.prototype.reverse = wrapperReverse;
        lodash.prototype.toString = wrapperToString;
        lodash.prototype.run = lodash.prototype.toJSON = lodash.prototype.valueOf = lodash.prototype.value = wrapperValue;
        lodash.prototype.collect = lodash.prototype.map;
        lodash.prototype.head = lodash.prototype.first;
        lodash.prototype.select = lodash.prototype.filter;
        lodash.prototype.tail = lodash.prototype.rest;
        return lodash;
      }
      var _ = runInContext();
      if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
        root._ = _;
        define(function() {
          return _;
        });
      } else if (freeExports && freeModule) {
        if (moduleExports) {
          (freeModule.exports = _)._ = _;
        } else {
          freeExports._ = _;
        }
      } else {
        root._ = _;
      }
    }.call(this));
  })(require("github:jspm/nodelibs-process@0.1.1"));
  global.define = __define;
  return module.exports;
});

System.register("npm:lodash@3.8.0", ["npm:lodash@3.8.0/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:lodash@3.8.0/index");
  global.define = __define;
  return module.exports;
});

System.register("core/DataSource", [], function($__export) {
  "use strict";
  var __moduleName = "core/DataSource";
  var DataSource;
  return {
    setters: [],
    execute: function() {
      'use strict';
      DataSource = (function() {
        function DataSource(path) {
          this._dataReference = null;
        }
        return ($traceurRuntime.createClass)(DataSource, {
          get inheritable() {
            return false;
          },
          child: function(childName) {},
          path: function() {},
          key: function() {},
          set: function(newData) {},
          remove: function() {},
          push: function(newData) {},
          setWithPriority: function(newData, priority) {},
          setPriority: function(newPriority) {},
          setValueChangedCallback: function(callback) {},
          removeValueChangedCallback: function() {},
          setChildAddedCallback: function(callback) {},
          removeChildAddedCallback: function() {},
          setChildChangedCallback: function(callback) {},
          removeChildChangedCallback: function() {},
          setChildMovedCallback: function(callback) {},
          removeChildMovedCallback: function() {},
          setChildRemovedCallback: function(callback) {},
          removeChildRemovedCallback: function() {}
        }, {});
      }());
      $__export("DataSource", DataSource);
    }
  };
});

System.register("utils/objectHelper", ["npm:lodash@3.8.0"], function($__export) {
  "use strict";
  var __moduleName = "utils/objectHelper";
  var _;
  return {
    setters: [function($__m) {
      _ = $__m.default;
    }],
    execute: function() {
      $__export('default', (function() {
        function ObjectHelper() {}
        return ($traceurRuntime.createClass)(ObjectHelper, {}, {
          hideMethodsAndPrivatePropertiesFromObject: function(object) {
            for (var propName in object) {
              var prototype = Object.getPrototypeOf(object);
              var descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, propName) : undefined;
              if (descriptor && (descriptor.get || descriptor.set) && !propName.startsWith('_')) {
                continue;
              }
              var property = object[propName];
              if (typeof property === 'function' || propName.startsWith('_')) {
                ObjectHelper.hidePropertyFromObject(object, propName);
              }
            }
          },
          hideMethodsFromObject: function(object) {
            for (var propName in object) {
              var property = object[propName];
              if (typeof property === 'function') {
                ObjectHelper.hidePropertyFromObject(object, propName);
              }
            }
          },
          hidePropertyFromObject: function(object, propName) {
            var prototype = object;
            var descriptor = Object.getOwnPropertyDescriptor(object, propName);
            while (!descriptor) {
              prototype = Object.getPrototypeOf(prototype);
              if (prototype.constructor.name === 'Object' || prototype.constructor.name === 'Array') {
                return ;
              }
              descriptor = Object.getOwnPropertyDescriptor(prototype, propName);
            }
            descriptor.enumerable = false;
            Object.defineProperty(prototype, propName, descriptor);
            Object.defineProperty(object, propName, descriptor);
          },
          hideAllPropertiesFromObject: function(object) {
            for (var propName in object) {
              ObjectHelper.hidePropertyFromObject(object, propName);
            }
          },
          addHiddenPropertyToObject: function(object, propName, prop) {
            var writable = arguments[3] !== (void 0) ? arguments[3] : true;
            var useAccessors = arguments[4] !== (void 0) ? arguments[4] : true;
            return ObjectHelper.addPropertyToObject(object, propName, prop, false, writable, undefined, useAccessors);
          },
          addPropertyToObject: function(object, propName, prop) {
            var enumerable = arguments[3] !== (void 0) ? arguments[3] : true;
            var writable = arguments[4] !== (void 0) ? arguments[4] : true;
            var setCallback = arguments[5] !== (void 0) ? arguments[5] : null;
            var useAccessors = arguments[6] !== (void 0) ? arguments[6] : true;
            if (!writable || !useAccessors) {
              var descriptor = {
                enumerable: enumerable,
                writable: writable,
                value: prop
              };
              Object.defineProperty(object, propName, descriptor);
            } else {
              ObjectHelper.addGetSetPropertyWithShadow(object, propName, prop, enumerable, writable, setCallback);
            }
          },
          addGetSetPropertyWithShadow: function(object, propName, prop) {
            var enumerable = arguments[3] !== (void 0) ? arguments[3] : true;
            var writable = arguments[4] !== (void 0) ? arguments[4] : true;
            var setCallback = arguments[5] !== (void 0) ? arguments[5] : null;
            ObjectHelper.buildPropertyShadow(object, propName, prop);
            ObjectHelper.buildGetSetProperty(object, propName, enumerable, writable, setCallback);
          },
          buildPropertyShadow: function(object, propName, prop) {
            var shadow = {};
            if (!object || !propName) {
              debugger;
            }
            try {
              if ('shadow' in object) {
                shadow = object['shadow'];
              }
            } catch (error) {
              debugger;
            }
            shadow[propName] = prop;
            Object.defineProperty(object, 'shadow', {
              writable: true,
              configurable: true,
              enumerable: false,
              value: shadow
            });
          },
          buildGetSetProperty: function(object, propName) {
            var enumerable = arguments[2] !== (void 0) ? arguments[2] : true;
            var writable = arguments[3] !== (void 0) ? arguments[3] : true;
            var setCallback = arguments[4] !== (void 0) ? arguments[4] : null;
            var descriptor = {
              enumerable: enumerable,
              configurable: true,
              get: function() {
                return object['shadow'][propName];
              },
              set: function(value) {
                if (writable) {
                  object['shadow'][propName] = value;
                  if (setCallback && typeof setCallback === 'function') {
                    setCallback({
                      propertyName: propName,
                      newValue: value
                    });
                  }
                } else {
                  throw new ReferenceError('Attempted to write to non-writable property "' + propName + '".');
                }
              }
            };
            Object.defineProperty(object, propName, descriptor);
          },
          bindAllMethods: function(object, bindTarget) {
            var methodNames = ObjectHelper.getMethodNames(object);
            methodNames.forEach(function(name) {
              object[name] = object[name].bind(bindTarget);
            });
          },
          getMethodNames: function(object) {
            var methodNames = arguments[1] !== (void 0) ? arguments[1] : [];
            var propNames = Object.getOwnPropertyNames(object).filter(function(c) {
              return typeof object[c] === 'function';
            });
            methodNames = methodNames.concat(propNames);
            var prototype = Object.getPrototypeOf(object);
            if (prototype.constructor.name !== 'Object' && prototype.constructor.name !== 'Array') {
              return ObjectHelper.getMethodNames(prototype, methodNames);
            }
            return methodNames;
          },
          getEnumerableProperties: function(object) {
            return ObjectHelper.getPrototypeEnumerableProperties(object, object);
          },
          getPrototypeEnumerableProperties: function(rootObject, prototype) {
            var result = {};
            var propNames = Object.keys(prototype);
            var $__4 = true;
            var $__5 = false;
            var $__6 = undefined;
            try {
              for (var $__2 = void 0,
                  $__1 = (propNames.values())[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
                var name = $__2.value;
                {
                  var value = rootObject[name];
                  if (value !== null && value !== undefined && typeof value !== 'function') {
                    if (typeof value == 'object') {
                      result[name] = ObjectHelper.getEnumerableProperties(value);
                    } else {
                      result[name] = value;
                    }
                  }
                }
              }
            } catch ($__7) {
              $__5 = true;
              $__6 = $__7;
            } finally {
              try {
                if (!$__4 && $__1.return != null) {
                  $__1.return();
                }
              } finally {
                if ($__5) {
                  throw $__6;
                }
              }
            }
            var descriptorNames = Object.getOwnPropertyNames(prototype);
            descriptorNames = descriptorNames.filter(function(name) {
              return propNames.indexOf(name) < 0;
            });
            var $__11 = true;
            var $__12 = false;
            var $__13 = undefined;
            try {
              for (var $__9 = void 0,
                  $__8 = (descriptorNames.values())[$traceurRuntime.toProperty(Symbol.iterator)](); !($__11 = ($__9 = $__8.next()).done); $__11 = true) {
                var name$__15 = $__9.value;
                {
                  var descriptor = Object.getOwnPropertyDescriptor(prototype, name$__15);
                  if (descriptor && descriptor.enumerable) {
                    var value$__16 = rootObject[name$__15];
                    if (value$__16 !== null && value$__16 !== undefined && typeof value$__16 !== 'function') {
                      if (typeof value$__16 == 'object') {
                        result[name$__15] = ObjectHelper.getEnumerableProperties(value$__16);
                      } else {
                        result[name$__15] = value$__16;
                      }
                    }
                  }
                }
              }
            } catch ($__14) {
              $__12 = true;
              $__13 = $__14;
            } finally {
              try {
                if (!$__11 && $__8.return != null) {
                  $__8.return();
                }
              } finally {
                if ($__12) {
                  throw $__13;
                }
              }
            }
            var superPrototype = Object.getPrototypeOf(prototype);
            if (superPrototype.constructor.name !== 'Object' && superPrototype.constructor.name !== 'Array') {
              var prototypeEnumerables = ObjectHelper.getPrototypeEnumerableProperties(rootObject, superPrototype);
              _.merge(result, prototypeEnumerables);
            }
            return result;
          }
        });
      }()));
    }
  };
});

System.register("core/Model/snapshot", [], function($__export) {
  "use strict";
  var __moduleName = "core/Model/snapshot";
  return {
    setters: [],
    execute: function() {
      $__export('default', (function() {
        function Snapshot(dataSnapshot) {}
        return ($traceurRuntime.createClass)(Snapshot, {
          key: function() {},
          val: function() {},
          ref: function() {},
          getPriority: function() {},
          forEach: function() {},
          numChildren: function() {}
        }, {});
      }()));
    }
  };
});

System.register("github:Bizboard/arva-context@master/Context", [], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/arva-context@master/Context";
  var contextContainer,
      Context;
  return {
    setters: [],
    execute: function() {
      contextContainer = {};
      Context = {
        getContext: function() {
          var contextName = arguments[0] !== (void 0) ? arguments[0] : null;
          if (contextName)
            return contextContainer[contextName];
          else
            return contextContainer['Default'];
        },
        setContext: function(contextName, context) {
          contextContainer[contextName] = context;
        }
      };
      $__export("Context", Context);
    }
  };
});

System.register("github:Bizboard/di.js@master/util", [], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/util";
  var ownKeys;
  function isUpperCase(char) {
    return char.toUpperCase() === char;
  }
  function isFunction(value) {
    return typeof value === 'function';
  }
  function isObject(value) {
    return typeof value === 'object';
  }
  function toString(token) {
    if (typeof token === 'string') {
      return token;
    }
    if (token === undefined || token === null) {
      return '' + token;
    }
    if (token.name) {
      return token.name;
    }
    return token.toString();
  }
  return {
    setters: [],
    execute: function() {
      ownKeys = (this.Reflect && Reflect.ownKeys ? Reflect.ownKeys : function ownKeys(O) {
        var keys = Object.getOwnPropertyNames(O);
        if (Object.getOwnPropertySymbols)
          return keys.concat(Object.getOwnPropertySymbols(O));
        return keys;
      });
      $__export("isUpperCase", isUpperCase), $__export("isFunction", isFunction), $__export("isObject", isObject), $__export("toString", toString), $__export("ownKeys", ownKeys);
    }
  };
});

System.register("github:Bizboard/di.js@master/profiler", ["github:Bizboard/di.js@master/util"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/profiler";
  var toString,
      IS_DEBUG,
      _global,
      globalCounter;
  function getUniqueId() {
    return ++globalCounter;
  }
  function serializeToken(token, tokens) {
    if (!tokens.has(token)) {
      tokens.set(token, getUniqueId().toString());
    }
    return tokens.get(token);
  }
  function serializeProvider(provider, key, tokens) {
    return {
      id: serializeToken(key, tokens),
      name: toString(key),
      isPromise: provider.isPromise,
      dependencies: provider.params.map(function(param) {
        return {
          token: serializeToken(param.token, tokens),
          isPromise: param.isPromise,
          isLazy: param.isLazy
        };
      })
    };
  }
  function serializeInjector(injector, tokens, Injector) {
    var serializedInjector = {
      id: serializeToken(injector, tokens),
      parent_id: injector._parent ? serializeToken(injector._parent, tokens) : null,
      providers: {}
    };
    var injectorClassId = serializeToken(Injector, tokens);
    serializedInjector.providers[injectorClassId] = {
      id: injectorClassId,
      name: toString(Injector),
      isPromise: false,
      dependencies: []
    };
    injector._providers.forEach(function(provider, key) {
      var serializedProvider = serializeProvider(provider, key, tokens);
      serializedInjector.providers[serializedProvider.id] = serializedProvider;
    });
    return serializedInjector;
  }
  function profileInjector(injector, Injector) {
    if (!IS_DEBUG) {
      return ;
    }
    if (!_global.__di_dump__) {
      _global.__di_dump__ = {
        injectors: [],
        tokens: new Map()
      };
    }
    _global.__di_dump__.injectors.push(serializeInjector(injector, _global.__di_dump__.tokens, Injector));
  }
  $__export("profileInjector", profileInjector);
  return {
    setters: [function($__m) {
      toString = $__m.toString;
    }],
    execute: function() {
      IS_DEBUG = false;
      _global = null;
      if (typeof process === 'object' && process.env) {
        IS_DEBUG = !!process.env['DEBUG'];
        _global = global;
      } else if (typeof location === 'object' && location.search) {
        IS_DEBUG = /di_debug/.test(location.search);
        _global = window;
      }
      globalCounter = 0;
    }
  };
});

System.register("github:Bizboard/di.js@master/providers", ["github:Bizboard/di.js@master/annotations", "github:Bizboard/di.js@master/util"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/providers";
  var ClassProviderAnnotation,
      FactoryProviderAnnotation,
      SuperConstructorAnnotation,
      readAnnotations,
      hasAnnotation,
      isFunction,
      isObject,
      toString,
      isUpperCase,
      ownKeys,
      EmptyFunction,
      ClassProvider,
      FactoryProvider;
  function isClass(clsOrFunction) {
    if (hasAnnotation(clsOrFunction, ClassProviderAnnotation)) {
      return true;
    } else if (hasAnnotation(clsOrFunction, FactoryProviderAnnotation)) {
      return false;
    } else if (clsOrFunction.name) {
      return isUpperCase(clsOrFunction.name.charAt(0));
    } else {
      return ownKeys(clsOrFunction.prototype).length > 0;
    }
  }
  function createProviderFromFnOrClass(fnOrClass, annotations) {
    if (isClass(fnOrClass)) {
      return new ClassProvider(fnOrClass, annotations.params, annotations.provide.isPromise);
    }
    return new FactoryProvider(fnOrClass, annotations.params, annotations.provide.isPromise);
  }
  $__export("createProviderFromFnOrClass", createProviderFromFnOrClass);
  return {
    setters: [function($__m) {
      ClassProviderAnnotation = $__m.ClassProvider;
      FactoryProviderAnnotation = $__m.FactoryProvider;
      SuperConstructorAnnotation = $__m.SuperConstructor;
      readAnnotations = $__m.readAnnotations;
      hasAnnotation = $__m.hasAnnotation;
    }, function($__m) {
      isFunction = $__m.isFunction;
      isObject = $__m.isObject;
      toString = $__m.toString;
      isUpperCase = $__m.isUpperCase;
      ownKeys = $__m.ownKeys;
    }],
    execute: function() {
      EmptyFunction = Object.getPrototypeOf(Function);
      ClassProvider = (function() {
        function ClassProvider(clazz, params, isPromise) {
          this.provider = clazz;
          this.isPromise = isPromise;
          this.params = [];
          this._constructors = [];
          this._flattenParams(clazz, params);
          this._constructors.unshift([clazz, 0, this.params.length - 1]);
        }
        return ($traceurRuntime.createClass)(ClassProvider, {
          _flattenParams: function(constructor, params) {
            var SuperConstructor;
            var constructorInfo;
            var $__4 = true;
            var $__5 = false;
            var $__6 = undefined;
            try {
              for (var $__2 = void 0,
                  $__1 = (params)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
                var param = $__2.value;
                {
                  if (param.token === SuperConstructorAnnotation) {
                    SuperConstructor = Object.getPrototypeOf(constructor);
                    if (SuperConstructor === EmptyFunction) {
                      throw new Error((toString(constructor) + " does not have a parent constructor. Only classes with a parent can ask for SuperConstructor!"));
                    }
                    constructorInfo = [SuperConstructor, this.params.length];
                    this._constructors.push(constructorInfo);
                    this._flattenParams(SuperConstructor, readAnnotations(SuperConstructor).params);
                    constructorInfo.push(this.params.length - 1);
                  } else {
                    this.params.push(param);
                  }
                }
              }
            } catch ($__7) {
              $__5 = true;
              $__6 = $__7;
            } finally {
              try {
                if (!$__4 && $__1.return != null) {
                  $__1.return();
                }
              } finally {
                if ($__5) {
                  throw $__6;
                }
              }
            }
          },
          _createConstructor: function(currentConstructorIdx, context, allArguments) {
            var constructorInfo = this._constructors[currentConstructorIdx];
            var nextConstructorInfo = this._constructors[currentConstructorIdx + 1];
            var argsForCurrentConstructor;
            if (nextConstructorInfo) {
              argsForCurrentConstructor = allArguments.slice(constructorInfo[1], nextConstructorInfo[1]).concat([this._createConstructor(currentConstructorIdx + 1, context, allArguments)]).concat(allArguments.slice(nextConstructorInfo[2] + 1, constructorInfo[2] + 1));
            } else {
              argsForCurrentConstructor = allArguments.slice(constructorInfo[1], constructorInfo[2] + 1);
            }
            return function InjectedAndBoundSuperConstructor() {
              return constructorInfo[0].apply(context, argsForCurrentConstructor);
            };
          },
          create: function(args) {
            var context = Object.create(this.provider.prototype);
            var constructor = this._createConstructor(0, context, args);
            var returnedValue = constructor();
            if (isFunction(returnedValue) || isObject(returnedValue)) {
              return returnedValue;
            }
            return context;
          }
        }, {});
      }());
      FactoryProvider = (function() {
        function FactoryProvider(factoryFunction, params, isPromise) {
          this.provider = factoryFunction;
          this.params = params;
          this.isPromise = isPromise;
          var $__4 = true;
          var $__5 = false;
          var $__6 = undefined;
          try {
            for (var $__2 = void 0,
                $__1 = (params)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
              var param = $__2.value;
              {
                if (param.token === SuperConstructorAnnotation) {
                  throw new Error((toString(factoryFunction) + " is not a class. Only classes with a parent can ask for SuperConstructor!"));
                }
              }
            }
          } catch ($__7) {
            $__5 = true;
            $__6 = $__7;
          } finally {
            try {
              if (!$__4 && $__1.return != null) {
                $__1.return();
              }
            } finally {
              if ($__5) {
                throw $__6;
              }
            }
          }
        }
        return ($traceurRuntime.createClass)(FactoryProvider, {create: function(args) {
            return this.provider.apply(undefined, args);
          }}, {});
      }());
    }
  };
});

System.register("components/RequestClient", [], function($__export) {
  "use strict";
  var __moduleName = "components/RequestClient";
  function GetRequest(url) {
    return new Promise(function(resolve, reject) {
      var req = new XMLHttpRequest();
      req.open('GET', url, true);
      req.onload = function() {
        if (req.status == 200) {
          resolve(req.response);
        } else {
          reject(Error(req.statusText));
        }
      };
      req.onerror = function() {
        reject(Error("Network Error"));
      };
      req.send();
    });
  }
  function PostRequest(options) {
    if (!options)
      options = {};
    if (!options.headers)
      options.headers = new Map();
    if (!options.data)
      options.data = "";
    return new Promise((function(resolve, reject) {
      var req = new XMLHttpRequest();
      req.open("POST", options.url, true);
      var $__3 = true;
      var $__4 = false;
      var $__5 = undefined;
      try {
        for (var $__1 = void 0,
            $__0 = (options.headers.entries())[$traceurRuntime.toProperty(Symbol.iterator)](); !($__3 = ($__1 = $__0.next()).done); $__3 = true) {
          var entry = $__1.value;
          req.setRequestHeader(entry[0], entry[1]);
        }
      } catch ($__6) {
        $__4 = true;
        $__5 = $__6;
      } finally {
        try {
          if (!$__3 && $__0.return != null) {
            $__0.return();
          }
        } finally {
          if ($__4) {
            throw $__5;
          }
        }
      }
      req.onload = function() {
        if (req.status == 200) {
          resolve(req.response);
        } else {
          reject(Error(req.statusText));
        }
      };
      req.onerror = function() {
        reject(Error("Network Error"));
      };
      req.send(options.data);
    }));
  }
  $__export("GetRequest", GetRequest);
  $__export("PostRequest", PostRequest);
  return {
    setters: [],
    execute: function() {
    }
  };
});

System.register("components/XmlParser", [], function($__export) {
  "use strict";
  var __moduleName = "components/XmlParser";
  function ParseStringToXml(text) {
    try {
      var xml = null;
      if (window.DOMParser) {
        var parser = new DOMParser();
        xml = parser.parseFromString(text, "text/xml");
        var found = xml.getElementsByTagName("parsererror");
        if (!found || !found.length || !found[0].childNodes.length) {
          return xml;
        }
        return null;
      } else {
        xml = new ActiveXObject("Microsoft.XMLDOM");
        xml.async = false;
        xml.loadXML(text);
        return xml;
      }
    } catch (e) {
      console.log('Error parsing the string to xml.');
    }
  }
  $__export("ParseStringToXml", ParseStringToXml);
  return {
    setters: [],
    execute: function() {
    }
  };
});

System.register("components/UrlParser", [], function($__export) {
  "use strict";
  var __moduleName = "components/UrlParser";
  function UrlParser(url) {
    var e = /^([a-z][a-z0-9+.-]*):(?:\/\/((?:(?=((?:[a-z0-9-._~!$&'()*+,;=:]|%[0-9A-F]{2})*))(\3)@)?(?=(\[[0-9A-F:.]{2,}\]|(?:[a-z0-9-._~!$&'()*+,;=]|%[0-9A-F]{2})*))\5(?::(?=(\d*))\6)?)(\/(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/]|%[0-9A-F]{2})*))\8)?|(\/?(?!\/)(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/]|%[0-9A-F]{2})*))\10)?)(?:\?(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/?]|%[0-9A-F]{2})*))\11)?(?:#(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/?]|%[0-9A-F]{2})*))\12)?$/i;
    if (url.match(e)) {
      return {
        url: RegExp['$&'],
        protocol: RegExp.$1,
        host: RegExp.$2,
        path: RegExp.$8,
        hash: RegExp.$12
      };
    } else {
      return null;
    }
  }
  $__export("UrlParser", UrlParser);
  return {
    setters: [],
    execute: function() {
    }
  };
});

System.register("datasources/SharePoint/SharePointSnapshot", ["utils/objectHelper", "core/Model/snapshot"], function($__export) {
  "use strict";
  var __moduleName = "datasources/SharePoint/SharePointSnapshot";
  var ObjectHelper,
      Snapshot;
  return {
    setters: [function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      Snapshot = $__m.default;
    }],
    execute: function() {
      $__export('default', (function($__super) {
        function SharePointSnapshot(dataSnapshot) {
          var dataSource = arguments[1] !== (void 0) ? arguments[1] : null;
          var kvpair = arguments[2] !== (void 0) ? arguments[2] : null;
          $traceurRuntime.superConstructor(SharePointSnapshot).call(this);
          this._data = dataSnapshot;
          this._dataSource = dataSource;
          this._kvpair = kvpair;
          ObjectHelper.bindAllMethods(this, this);
        }
        return ($traceurRuntime.createClass)(SharePointSnapshot, {
          key: function() {
            if (this._kvpair)
              return this._kvpair.key;
            else if (this._data instanceof Array && this._data.length == 1)
              return this._data[0].id;
            else if (this._data instanceof Object)
              return this._data.id;
          },
          val: function() {
            if (this._kvpair)
              return this._kvpair.value;
            else
              return this._data;
          },
          ref: function() {
            return this._dataSource;
          },
          getPriority: function() {},
          forEach: function(callback) {
            if (this._data instanceof Array) {
              var $__4 = true;
              var $__5 = false;
              var $__6 = undefined;
              try {
                for (var $__2 = void 0,
                    $__1 = (this._data)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
                  var object = $__2.value;
                  {
                    callback(new SharePointSnapshot(object, this._dataSource));
                  }
                }
              } catch ($__7) {
                $__5 = true;
                $__6 = $__7;
              } finally {
                try {
                  if (!$__4 && $__1.return != null) {
                    $__1.return();
                  }
                } finally {
                  if ($__5) {
                    throw $__6;
                  }
                }
              }
            } else if (this._data instanceof Object) {
              for (var key in this._data) {
                callback(new SharePointSnapshot(object, this._dataSource, {
                  key: key,
                  value: this._data[key]
                }));
              }
            }
          },
          numChildren: function() {
            if (this._data instanceof Array)
              return this._data.length;
            else
              return 1;
          }
        }, {}, $__super);
      }(Snapshot)));
    }
  };
});

System.register("core/Model/prioritisedObject", ["utils/objectHelper", "core/Model/snapshot", "npm:lodash@3.8.0"], function($__export) {
  "use strict";
  var __moduleName = "core/Model/prioritisedObject";
  var ObjectHelper,
      Snapshot,
      _;
  return {
    setters: [function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      Snapshot = $__m.default;
    }, function($__m) {
      _ = $__m.default;
    }],
    execute: function() {
      'use strict';
      $__export('default', (function() {
        function PrioritisedObject(dataSource) {
          var dataSnapshot = arguments[1] !== (void 0) ? arguments[1] : null;
          this._valueChangedCallback = null;
          this._dataSource = dataSource;
          this._priority = 0;
          this._isBeingWrittenByDatasource = false;
          ObjectHelper.bindAllMethods(this, this);
          ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);
          ObjectHelper.hidePropertyFromObject(this, 'id');
          ObjectHelper.hidePropertyFromObject(this, 'priority');
          if (dataSnapshot) {
            this._buildFromSnapshot(dataSnapshot);
          } else {
            this._buildFromDataSource(dataSource);
          }
        }
        return ($traceurRuntime.createClass)(PrioritisedObject, {
          get id() {
            return this._id;
          },
          set id(value) {},
          get priority() {
            return this._priority;
          },
          set priority(value) {
            if (this._priority !== value) {
              this._priority = value;
              this._dataSource.setPriority(value);
            }
          },
          get _inheritable() {
            if (!this._dataSource)
              return false;
            return this._dataSource.inheritable;
          },
          delete: function() {
            this.removeValueChangedCallback();
            if (this._dataSource.inheritable)
              this._dataSource.remove(this);
            else
              this._dataSource.remove();
            delete this;
          },
          setValueChangedCallback: function(callback) {
            this._valueChangedCallback = callback;
            this._dataSource.setValueChangedCallback(this._onDataSourceValue.bind(this));
          },
          removeValueChangedCallback: function() {
            this._dataSource.removeValueChangedCallback();
            this._valueChangedCallback = null;
          },
          _buildFromSnapshot: function(dataSnapshot) {
            var $__0 = this;
            this._priority = dataSnapshot.getPriority();
            var numChidren = dataSnapshot.numChildren();
            dataSnapshot.forEach((function(child) {
              var ref = child.ref();
              var key = child.key();
              var val = child.val();
              $__0._id = key;
              if (typeof val === 'object' && val !== null) {
                val = new PrioritisedObject(ref, child);
                ObjectHelper.addPropertyToObject($__0, key, val, true, true);
              } else {
                if (Object.getOwnPropertyDescriptor($__0, key)) {
                  ObjectHelper.addPropertyToObject($__0, key, val, true, true, $__0._onSetterTriggered);
                }
              }
            }));
          },
          _buildFromDataSource: function(dataSource) {
            var $__0 = this;
            var path = dataSource.path();
            var DataSource = Object.getPrototypeOf(dataSource).constructor;
            var newSource = new DataSource(path);
            newSource.setValueChangedCallback((function(dataSnapshot) {
              newSource.removeValueChangedCallback();
              $__0._buildFromSnapshot(dataSnapshot);
            }));
          },
          _onSetterTriggered: function() {
            if (!this._isBeingWrittenByDatasource) {
              this._dataSource.setWithPriority(ObjectHelper.getEnumerableProperties(this), this._priority);
            }
          },
          _onDataSourceValue: function(dataSnapshot) {
            if (_.isEqual(this, dataSnapshot)) {
              return ;
            }
            this._isBeingWrittenByDatasource = true;
            this._buildFromSnapshot(dataSnapshot);
            this._isBeingWrittenByDatasource = false;
            if (this._valueChangedCallback) {
              this._valueChangedCallback(this);
            }
          }
        }, {});
      }()));
    }
  };
});

System.register("github:Bizboard/di.js@master/annotations", ["github:Bizboard/di.js@master/util"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/annotations";
  var isFunction,
      SuperConstructor,
      TransientScope,
      Inject,
      InjectPromise,
      InjectLazy,
      Provide,
      ProvidePromise,
      ClassProvider,
      FactoryProvider;
  function annotate(fn, annotation) {
    fn.annotations = fn.annotations || [];
    fn.annotations.push(annotation);
  }
  function hasAnnotation(fn, annotationClass) {
    if (!fn.annotations || fn.annotations.length === 0) {
      return false;
    }
    var $__4 = true;
    var $__5 = false;
    var $__6 = undefined;
    try {
      for (var $__2 = void 0,
          $__1 = (fn.annotations)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
        var annotation = $__2.value;
        {
          if (annotation instanceof annotationClass) {
            return true;
          }
        }
      }
    } catch ($__7) {
      $__5 = true;
      $__6 = $__7;
    } finally {
      try {
        if (!$__4 && $__1.return != null) {
          $__1.return();
        }
      } finally {
        if ($__5) {
          throw $__6;
        }
      }
    }
    return false;
  }
  function readAnnotations(fn) {
    var collectedAnnotations = {
      provide: {
        token: null,
        isPromise: false
      },
      params: []
    };
    if (fn.annotations && fn.annotations.length) {
      var $__4 = true;
      var $__5 = false;
      var $__6 = undefined;
      try {
        for (var $__2 = void 0,
            $__1 = (fn.annotations)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
          var annotation = $__2.value;
          {
            if (annotation instanceof Inject) {
              annotation.tokens.forEach((function(token) {
                collectedAnnotations.params.push({
                  token: token,
                  isPromise: annotation.isPromise,
                  isLazy: annotation.isLazy
                });
              }));
            }
            if (annotation instanceof Provide) {
              collectedAnnotations.provide.token = annotation.token;
              collectedAnnotations.provide.isPromise = annotation.isPromise;
            }
          }
        }
      } catch ($__7) {
        $__5 = true;
        $__6 = $__7;
      } finally {
        try {
          if (!$__4 && $__1.return != null) {
            $__1.return();
          }
        } finally {
          if ($__5) {
            throw $__6;
          }
        }
      }
    }
    if (fn.parameters) {
      fn.parameters.forEach((function(param, idx) {
        var $__11 = true;
        var $__12 = false;
        var $__13 = undefined;
        try {
          for (var $__9 = void 0,
              $__8 = (param)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__11 = ($__9 = $__8.next()).done); $__11 = true) {
            var paramAnnotation = $__9.value;
            {
              if (isFunction(paramAnnotation) && !collectedAnnotations.params[idx]) {
                collectedAnnotations.params[idx] = {
                  token: paramAnnotation,
                  isPromise: false,
                  isLazy: false
                };
              } else if (paramAnnotation instanceof Inject) {
                collectedAnnotations.params[idx] = {
                  token: paramAnnotation.tokens[0],
                  isPromise: paramAnnotation.isPromise,
                  isLazy: paramAnnotation.isLazy
                };
              }
            }
          }
        } catch ($__14) {
          $__12 = true;
          $__13 = $__14;
        } finally {
          try {
            if (!$__11 && $__8.return != null) {
              $__8.return();
            }
          } finally {
            if ($__12) {
              throw $__13;
            }
          }
        }
      }));
    }
    return collectedAnnotations;
  }
  return {
    setters: [function($__m) {
      isFunction = $__m.isFunction;
    }],
    execute: function() {
      SuperConstructor = (function() {
        function SuperConstructor() {}
        return ($traceurRuntime.createClass)(SuperConstructor, {}, {});
      }());
      TransientScope = (function() {
        function TransientScope() {}
        return ($traceurRuntime.createClass)(TransientScope, {}, {});
      }());
      Inject = (function() {
        function Inject() {
          for (var tokens = [],
              $__15 = 0; $__15 < arguments.length; $__15++)
            tokens[$__15] = arguments[$__15];
          this.tokens = tokens;
          this.isPromise = false;
          this.isLazy = false;
        }
        return ($traceurRuntime.createClass)(Inject, {}, {});
      }());
      InjectPromise = (function($__super) {
        function InjectPromise() {
          for (var tokens = [],
              $__15 = 0; $__15 < arguments.length; $__15++)
            tokens[$__15] = arguments[$__15];
          $traceurRuntime.superConstructor(InjectPromise).call(this, tokens);
          this.tokens = tokens;
          this.isPromise = true;
          this.isLazy = false;
        }
        return ($traceurRuntime.createClass)(InjectPromise, {}, {}, $__super);
      }(Inject));
      InjectLazy = (function($__super) {
        function InjectLazy() {
          for (var tokens = [],
              $__15 = 0; $__15 < arguments.length; $__15++)
            tokens[$__15] = arguments[$__15];
          $traceurRuntime.superConstructor(InjectLazy).call(this, tokens);
          this.tokens = tokens;
          this.isPromise = false;
          this.isLazy = true;
        }
        return ($traceurRuntime.createClass)(InjectLazy, {}, {}, $__super);
      }(Inject));
      Provide = (function() {
        function Provide(token) {
          this.token = token;
          this.isPromise = false;
        }
        return ($traceurRuntime.createClass)(Provide, {}, {});
      }());
      ProvidePromise = (function($__super) {
        function ProvidePromise(token) {
          $traceurRuntime.superConstructor(ProvidePromise).call(this, token);
          this.token = token;
          this.isPromise = true;
        }
        return ($traceurRuntime.createClass)(ProvidePromise, {}, {}, $__super);
      }(Provide));
      ClassProvider = (function() {
        function ClassProvider() {}
        return ($traceurRuntime.createClass)(ClassProvider, {}, {});
      }());
      FactoryProvider = (function() {
        function FactoryProvider() {}
        return ($traceurRuntime.createClass)(FactoryProvider, {}, {});
      }());
      $__export("annotate", annotate), $__export("hasAnnotation", hasAnnotation), $__export("readAnnotations", readAnnotations), $__export("SuperConstructor", SuperConstructor), $__export("TransientScope", TransientScope), $__export("Inject", Inject), $__export("InjectPromise", InjectPromise), $__export("InjectLazy", InjectLazy), $__export("Provide", Provide), $__export("ProvidePromise", ProvidePromise), $__export("ClassProvider", ClassProvider), $__export("FactoryProvider", FactoryProvider);
    }
  };
});

System.register("datasources/SharePoint/SoapClient", ["datasources/SharePoint/xml2js", "npm:lodash@3.8.0", "components/RequestClient", "utils/objectHelper", "components/XmlParser"], function($__export) {
  "use strict";
  var __moduleName = "datasources/SharePoint/SoapClient";
  var XML2JS,
      _,
      PostRequest,
      ObjectHelper,
      ParseStringToXml,
      SoapClient;
  return {
    setters: [function($__m) {
      XML2JS = $__m.default;
    }, function($__m) {
      _ = $__m.default;
    }, function($__m) {
      PostRequest = $__m.PostRequest;
    }, function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      ParseStringToXml = $__m.ParseStringToXml;
    }],
    execute: function() {
      SoapClient = (function() {
        function SoapClient() {
          ObjectHelper.bindAllMethods(this, this);
          ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);
          ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'length');
        }
        return ($traceurRuntime.createClass)(SoapClient, {
          _applySoapTemplate: function(properties) {
            return _.template('<?xml version="1.0" encoding="utf-8"?>' + '<soap:Envelope ' + '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' + '  xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' + '  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' + '<soap:Body>' + '<<%= method %> xmlns="http://schemas.microsoft.com/sharepoint/soap/">' + '<%= params %>' + '</<%= method %>>' + '</soap:Body>' + '</soap:Envelope>')(properties);
          },
          _serializeParams: function(params) {
            if (!params || params.length == 0)
              return "";
            var data = {"root": params};
            var creator = new XML2JS();
            var payload = creator.json2xml_str(data);
            return payload.replace("<root>", "").replace("</root>", "");
          },
          _handleError: function(error) {
            return "Error!";
          },
          _handleSuccess: function(data) {
            var nodes,
                node,
                rootnode,
                name,
                NODE_ELEMENT = 1,
                attributes,
                attribute,
                results = [],
                result,
                root = '',
                i,
                j;
            if (typeof(data.selectSingleNode) != "undefined")
              rootnode = data.selectSingleNode("//rs:data");
            else
              rootnode = data.querySelector("data");
            if (rootnode) {
              nodes = rootnode.childNodes;
            } else {
              if (typeof(data.selectSingleNode) != "undefined") {
                rootnode = data.selectSingleNode("//Result");
                nodes = rootnode.selectNodes("//row");
              } else {
                rootnode = data.querySelector("Result");
                nodes = rootnode.querySelectorAll("row");
              }
            }
            for (i = 0; i < nodes.length; i += 1) {
              node = nodes[i];
              if (node.nodeType === NODE_ELEMENT) {
                attributes = node.attributes;
                result = {};
                for (j = 0; j < attributes.length; j += 1) {
                  attribute = attributes[j];
                  name = attribute.name.replace('ows_', '');
                  if (name == "ID") {
                    name = "id";
                    result[name] = attribute.value;
                  } else if (!isNaN(attribute.value))
                    result[name] = parseFloat(attribute.value);
                  else
                    result[name] = attribute.value;
                }
                if ((result.Hidden || '').toUpperCase() !== "TRUE") {
                  results.push(result);
                }
              }
            }
            return results;
          },
          call: function(config) {
            var request;
            config = config || {};
            request = {
              url: config.url,
              headers: config.headers,
              data: this._applySoapTemplate({
                method: config.method,
                params: this._serializeParams(config.params)
              })
            };
            var context = this;
            return new Promise(function(resolve, reject) {
              PostRequest(request).then(function(response) {
                var xmlDocument = ParseStringToXml(response);
                resolve(context._handleSuccess(xmlDocument));
              }, function(error) {
                reject(context._handleError(error));
              });
            });
          }
        }, {});
      }());
      $__export("SoapClient", SoapClient);
    }
  };
});

System.register("github:Bizboard/di.js@master/injector", ["github:Bizboard/di.js@master/annotations", "github:Bizboard/di.js@master/util", "github:Bizboard/di.js@master/profiler", "github:Bizboard/di.js@master/providers"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/injector";
  var annotate,
      readAnnotations,
      hasAnnotation,
      ProvideAnnotation,
      TransientScopeAnnotation,
      isFunction,
      toString,
      profileInjector,
      createProviderFromFnOrClass,
      Injector;
  function constructResolvingMessage(resolving, token) {
    if (arguments.length > 1) {
      resolving.push(token);
    }
    if (resolving.length > 1) {
      return (" (" + resolving.map(toString).join(' -> ') + ")");
    }
    return '';
  }
  return {
    setters: [function($__m) {
      annotate = $__m.annotate;
      readAnnotations = $__m.readAnnotations;
      hasAnnotation = $__m.hasAnnotation;
      ProvideAnnotation = $__m.Provide;
      TransientScopeAnnotation = $__m.TransientScope;
    }, function($__m) {
      isFunction = $__m.isFunction;
      toString = $__m.toString;
    }, function($__m) {
      profileInjector = $__m.profileInjector;
    }, function($__m) {
      createProviderFromFnOrClass = $__m.createProviderFromFnOrClass;
    }],
    execute: function() {
      Injector = (function() {
        function Injector() {
          var modules = arguments[0] !== (void 0) ? arguments[0] : [];
          var parentInjector = arguments[1] !== (void 0) ? arguments[1] : null;
          var providers = arguments[2] !== (void 0) ? arguments[2] : new Map();
          var scopes = arguments[3] !== (void 0) ? arguments[3] : [];
          this._cache = new Map();
          this._providers = providers;
          this._parent = parentInjector;
          this._scopes = scopes;
          this._loadModules(modules);
          profileInjector(this, Injector);
        }
        return ($traceurRuntime.createClass)(Injector, {
          _collectProvidersWithAnnotation: function(annotationClass, collectedProviders) {
            this._providers.forEach((function(provider, token) {
              if (!collectedProviders.has(token) && hasAnnotation(provider.provider, annotationClass)) {
                collectedProviders.set(token, provider);
              }
            }));
            if (this._parent) {
              this._parent._collectProvidersWithAnnotation(annotationClass, collectedProviders);
            }
          },
          _loadModules: function(modules) {
            var $__5 = true;
            var $__6 = false;
            var $__7 = undefined;
            try {
              for (var $__3 = void 0,
                  $__2 = (modules)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
                var module = $__3.value;
                {
                  if (isFunction(module)) {
                    this._loadFnOrClass(module);
                    continue;
                  }
                  throw new Error('Invalid module!');
                }
              }
            } catch ($__8) {
              $__6 = true;
              $__7 = $__8;
            } finally {
              try {
                if (!$__5 && $__2.return != null) {
                  $__2.return();
                }
              } finally {
                if ($__6) {
                  throw $__7;
                }
              }
            }
          },
          _loadFnOrClass: function(fnOrClass) {
            var annotations = readAnnotations(fnOrClass);
            var token = annotations.provide.token || fnOrClass;
            var provider = createProviderFromFnOrClass(fnOrClass, annotations);
            this._providers.set(token, provider);
          },
          _hasProviderFor: function(token) {
            if (this._providers.has(token)) {
              return true;
            }
            if (this._parent) {
              return this._parent._hasProviderFor(token);
            }
            return false;
          },
          _instantiateDefaultProvider: function(provider, token, resolving, wantPromise, wantLazy) {
            if (!this._parent) {
              this._providers.set(token, provider);
              return this.get(token, resolving, wantPromise, wantLazy);
            }
            var $__5 = true;
            var $__6 = false;
            var $__7 = undefined;
            try {
              for (var $__3 = void 0,
                  $__2 = (this._scopes)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
                var ScopeClass = $__3.value;
                {
                  if (hasAnnotation(provider.provider, ScopeClass)) {
                    this._providers.set(token, provider);
                    return this.get(token, resolving, wantPromise, wantLazy);
                  }
                }
              }
            } catch ($__8) {
              $__6 = true;
              $__7 = $__8;
            } finally {
              try {
                if (!$__5 && $__2.return != null) {
                  $__2.return();
                }
              } finally {
                if ($__6) {
                  throw $__7;
                }
              }
            }
            return this._parent._instantiateDefaultProvider(provider, token, resolving, wantPromise, wantLazy);
          },
          get: function(token) {
            var resolving = arguments[1] !== (void 0) ? arguments[1] : [];
            var wantPromise = arguments[2] !== (void 0) ? arguments[2] : false;
            var wantLazy = arguments[3] !== (void 0) ? arguments[3] : false;
            var $__0 = this;
            var resolvingMsg = '';
            var provider;
            var instance;
            var injector = this;
            if (token === null || token === undefined) {
              resolvingMsg = constructResolvingMessage(resolving, token);
              throw new Error(("Invalid token \"" + token + "\" requested!" + resolvingMsg));
            }
            if (token === Injector) {
              if (wantPromise) {
                return Promise.resolve(this);
              }
              return this;
            }
            if (wantLazy) {
              return function createLazyInstance() {
                var lazyInjector = injector;
                if (arguments.length) {
                  var locals = [];
                  var args = arguments;
                  for (var i = 0; i < args.length; i += 2) {
                    locals.push((function(ii) {
                      var fn = function createLocalInstance() {
                        return args[ii + 1];
                      };
                      annotate(fn, new ProvideAnnotation(args[ii]));
                      return fn;
                    })(i));
                  }
                  lazyInjector = injector.createChild(locals);
                }
                return lazyInjector.get(token, resolving, wantPromise, false);
              };
            }
            if (this._cache.has(token)) {
              instance = this._cache.get(token);
              provider = this._providers.get(token);
              if (provider.isPromise && !wantPromise) {
                resolvingMsg = constructResolvingMessage(resolving, token);
                throw new Error(("Cannot instantiate " + toString(token) + " synchronously. It is provided as a promise!" + resolvingMsg));
              }
              if (!provider.isPromise && wantPromise) {
                return Promise.resolve(instance);
              }
              return instance;
            }
            provider = this._providers.get(token);
            if (!provider && isFunction(token) && !this._hasProviderFor(token)) {
              provider = createProviderFromFnOrClass(token, readAnnotations(token));
              return this._instantiateDefaultProvider(provider, token, resolving, wantPromise, wantLazy);
            }
            if (!provider) {
              if (!this._parent) {
                resolvingMsg = constructResolvingMessage(resolving, token);
                throw new Error(("No provider for " + toString(token) + "!" + resolvingMsg));
              }
              return this._parent.get(token, resolving, wantPromise, wantLazy);
            }
            if (resolving.indexOf(token) !== -1) {
              resolvingMsg = constructResolvingMessage(resolving, token);
              throw new Error(("Cannot instantiate cyclic dependency!" + resolvingMsg));
            }
            resolving.push(token);
            var delayingInstantiation = wantPromise && provider.params.some((function(param) {
              return !param.isPromise;
            }));
            var args = provider.params.map((function(param) {
              if (delayingInstantiation) {
                return $__0.get(param.token, resolving, true, param.isLazy);
              }
              return $__0.get(param.token, resolving, param.isPromise, param.isLazy);
            }));
            if (delayingInstantiation) {
              var delayedResolving = resolving.slice();
              resolving.pop();
              return Promise.all(args).then(function(args) {
                try {
                  instance = provider.create(args);
                } catch (e) {
                  resolvingMsg = constructResolvingMessage(delayedResolving);
                  var originalMsg = 'ORIGINAL ERROR: ' + e.message;
                  e.message = ("Error during instantiation of " + toString(token) + "!" + resolvingMsg + "\n" + originalMsg);
                  throw e;
                }
                if (!hasAnnotation(provider.provider, TransientScopeAnnotation)) {
                  injector._cache.set(token, instance);
                }
                return instance;
              });
            }
            try {
              instance = provider.create(args);
            } catch (e) {
              resolvingMsg = constructResolvingMessage(resolving);
              var originalMsg = 'ORIGINAL ERROR: ' + e.message;
              e.message = ("Error during instantiation of " + toString(token) + "!" + resolvingMsg + "\n" + originalMsg);
              throw e;
            }
            if (!hasAnnotation(provider.provider, TransientScopeAnnotation)) {
              this._cache.set(token, instance);
            }
            if (!wantPromise && provider.isPromise) {
              resolvingMsg = constructResolvingMessage(resolving);
              throw new Error(("Cannot instantiate " + toString(token) + " synchronously. It is provided as a promise!" + resolvingMsg));
            }
            if (wantPromise && !provider.isPromise) {
              instance = Promise.resolve(instance);
            }
            resolving.pop();
            return instance;
          },
          getPromise: function(token) {
            return this.get(token, [], true);
          },
          createChild: function() {
            var modules = arguments[0] !== (void 0) ? arguments[0] : [];
            var forceNewInstancesOf = arguments[1] !== (void 0) ? arguments[1] : [];
            var forcedProviders = new Map();
            forceNewInstancesOf.push(TransientScopeAnnotation);
            var $__5 = true;
            var $__6 = false;
            var $__7 = undefined;
            try {
              for (var $__3 = void 0,
                  $__2 = (forceNewInstancesOf)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
                var annotation = $__3.value;
                {
                  this._collectProvidersWithAnnotation(annotation, forcedProviders);
                }
              }
            } catch ($__8) {
              $__6 = true;
              $__7 = $__8;
            } finally {
              try {
                if (!$__5 && $__2.return != null) {
                  $__2.return();
                }
              } finally {
                if ($__6) {
                  throw $__7;
                }
              }
            }
            return new Injector(modules, this, forcedProviders, forceNewInstancesOf);
          }
        }, {});
      }());
      $__export("Injector", Injector);
    }
  };
});

System.register("datasources/SharePointSoapDataSource", ["utils/objectHelper", "core/DataSource", "github:firebase/firebase-bower@2.2.4", "github:Bizboard/di.js@master", "datasources/SharePoint/SoapClient", "components/UrlParser", "datasources/SharePoint/SharePointSnapshot"], function($__export) {
  "use strict";
  var __moduleName = "datasources/SharePointSoapDataSource";
  var ObjectHelper,
      DataSource,
      Firebase,
      Provide,
      annotate,
      SoapClient,
      UrlParser,
      SharePointSnapshot,
      SharePointSoapDataSource;
  return {
    setters: [function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      DataSource = $__m.DataSource;
    }, function($__m) {
      Firebase = $__m.default;
    }, function($__m) {
      Provide = $__m.Provide;
      annotate = $__m.annotate;
    }, function($__m) {
      SoapClient = $__m.SoapClient;
    }, function($__m) {
      UrlParser = $__m.UrlParser;
    }, function($__m) {
      SharePointSnapshot = $__m.default;
    }],
    execute: function() {
      SharePointSoapDataSource = (function($__super) {
        function SharePointSoapDataSource(path, credentials) {
          $traceurRuntime.superConstructor(SharePointSoapDataSource).call(this, path);
          this._dataReference = null;
          this._onValueCallback = null;
          this._onAddCallback = null;
          this._onChangeCallback = null;
          this._onMoveCallback = null;
          this._onRemoveCallback = null;
          this._credentials = credentials;
          this._orginialPath = path;
          ObjectHelper.bindAllMethods(this, this);
          ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);
          ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'length');
          if (this.key().length == 0)
            return ;
          this._dataReference = new SoapClient();
          this._updateDataSource();
        }
        return ($traceurRuntime.createClass)(SharePointSoapDataSource, {
          _updateDataSource: function() {
            var $__0 = this;
            var configuration = this._GetListItemsDefaultConfiguration;
            configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
            configuration.params = {
              "listName": this.key(),
              "queryOptions": {"QueryOptions": {
                  "IncludeMandatoryColumns": "FALSE",
                  "ViewAttributes": {"_Scope": "RecursiveAll"}
                }}
            };
            this._dataReference.call(configuration).then((function(data) {
              var snapshot = new SharePointSnapshot(data, $__0);
              $__0._notifyOnValue(snapshot);
            }), (function(error) {
              console.log(error);
            }));
          },
          _notifyOnValue: function(snapshot) {
            if (this._onValueCallback) {
              this._onValueCallback(snapshot);
            }
          },
          _ParsePath: function(path, endPoint) {
            var url = UrlParser(path);
            if (!url)
              console.log("Invalid datasource path provided!");
            var pathParts = url.path.split('/');
            var newPath = url.protocol + "://" + url.host + "/";
            for (var i = 0; i < pathParts.length - 1; i++)
              newPath += pathParts[i] + "/";
            newPath += endPoint;
            return newPath;
          },
          get inheritable() {
            return true;
          },
          child: function(childName) {
            var newPath = this._orginialPath + "/" + childName;
            return new SharePointSoapDataSource(newPath);
          },
          path: function() {
            return this._orginialPath;
          },
          key: function() {
            var url = UrlParser(this._orginialPath);
            if (!url)
              console.log("Invalid datasource path provided!");
            if (url.path.length == 0)
              return "";
            var pathElements = url.path.split('/');
            if (pathElements.length == 1)
              return url.path;
            else
              return url.path.split('/').pop();
          },
          set: function(newData) {
            var $__0 = this;
            var configuration = this._UpdateListItemsDefaultConfiguration;
            configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
            var fieldCollection = [];
            var method = '';
            var callback;
            if (newData.id) {
              fieldCollection.push({
                "_Name": "ID",
                "__text": newData.id
              });
              method = "Update";
              callback = this._onChangeCallback;
            } else {
              fieldCollection.push({
                "_Name": "ID",
                "__text": 'New'
              });
              method = 'New';
              callback = this._onAddCallback;
            }
            for (var prop in newData) {
              if (prop == "id" || typeof(newData[prop]) == "undefined")
                continue;
              if (prop == "priority")
                continue;
              fieldCollection.push({
                "_Name": prop,
                "__text": newData[prop]
              });
            }
            configuration.params = {
              "listName": this.key(),
              "updates": {"Batch": {
                  "Method": {
                    "Field": fieldCollection,
                    "_ID": "1",
                    "_Cmd": method
                  },
                  "_OnError": "Continue",
                  "_ListVersion": "1",
                  "_ViewName": ""
                }}
            };
            this._dataReference.call(configuration).then((function(result) {
              var $__5 = true;
              var $__6 = false;
              var $__7 = undefined;
              try {
                for (var $__3 = void 0,
                    $__2 = (result)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
                  var data = $__3.value;
                  {
                    var snapshot = new SharePointSnapshot(data, $__0);
                    if (callback)
                      callback(snapshot);
                  }
                }
              } catch ($__8) {
                $__6 = true;
                $__7 = $__8;
              } finally {
                try {
                  if (!$__5 && $__2.return != null) {
                    $__2.return();
                  }
                } finally {
                  if ($__6) {
                    throw $__7;
                  }
                }
              }
            }), (function(error) {
              console.log(error);
            }));
            return this;
          },
          remove: function(object) {
            var $__0 = this;
            var configuration = this._UpdateListItemsDefaultConfiguration;
            configuration.url = this._ParsePath(this._orginialPath, this._GetListService);
            var fieldCollection = [];
            fieldCollection.push({
              "_Name": "ID",
              "__text": object.id
            });
            configuration.params = {
              "listName": this.key(),
              "updates": {"Batch": {
                  "Method": {
                    "Field": fieldCollection,
                    "_ID": '1',
                    "_Cmd": 'Delete'
                  },
                  "_OnError": 'Continue',
                  "_ListVersion": '1',
                  "_ViewName": ''
                }}
            };
            this._dataReference.call(configuration).then((function() {
              var snapshot = new SharePointSnapshot(null, $__0, {
                key: object.id,
                value: null
              });
              if ($__0._onRemoveCallback)
                $__0._onRemoveCallback(snapshot);
            }), (function(error) {
              console.log(error);
            }));
            return this;
          },
          push: function(newData) {
            return this.set(newData);
          },
          setWithPriority: function(newData, priority) {
            newData.priority = priority;
            this.set(newData);
          },
          setPriority: function(newPriority) {},
          setValueChangedCallback: function(callback) {
            this._onValueCallback = callback;
          },
          removeValueChangedCallback: function() {
            this._onValueCallback = null;
          },
          setChildAddedCallback: function(callback) {
            this._onAddCallback = callback;
          },
          removeChildAddedCallback: function() {
            this._onAddCallback = null;
          },
          setChildChangedCallback: function(callback) {
            this._onChangeCallback = callback;
          },
          removeChildChangedCallback: function() {
            this._onChangeCallback = null;
          },
          setChildMovedCallback: function(callback) {},
          removeChildMovedCallback: function() {},
          setChildRemovedCallback: function(callback) {
            this._onRemoveCallback = callback;
          },
          removeChildRemovedCallback: function() {
            this._onRemoveCallback = null;
          },
          get _UpdateListItemsDefaultConfiguration() {
            return {
              url: '',
              service: 'Lists',
              method: 'UpdateListItems',
              params: '',
              headers: new Map([['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/UpdateListItems'], ['Content-Type', 'text/xml']])
            };
          },
          get _GetListItemsDefaultConfiguration() {
            return {
              url: '',
              service: 'Lists',
              method: 'GetListItems',
              params: '',
              headers: new Map([['SOAPAction', 'http://schemas.microsoft.com/sharepoint/soap/GetListItems'], ['Content-Type', 'text/xml']])
            };
          },
          get _GetListService() {
            return '_vti_bin/Lists.asmx';
          },
          get _GetUserGroupService() {
            return '_vti_bin/UserGroup.asmx';
          }
        }, {}, $__super);
      }(DataSource));
      $__export("SharePointSoapDataSource", SharePointSoapDataSource);
    }
  };
});

System.register("github:Bizboard/di.js@master/index", ["github:Bizboard/di.js@master/injector", "github:Bizboard/di.js@master/annotations"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master/index";
  return {
    setters: [function($__m) {
      $__export("Injector", $__m.Injector);
    }, function($__m) {
      $__export("annotate", $__m.annotate);
      $__export("Inject", $__m.Inject);
      $__export("InjectLazy", $__m.InjectLazy);
      $__export("InjectPromise", $__m.InjectPromise);
      $__export("Provide", $__m.Provide);
      $__export("ProvidePromise", $__m.ProvidePromise);
      $__export("SuperConstructor", $__m.SuperConstructor);
      $__export("TransientScope", $__m.TransientScope);
      $__export("ClassProvider", $__m.ClassProvider);
      $__export("FactoryProvider", $__m.FactoryProvider);
    }],
    execute: function() {}
  };
});

System.register("github:Bizboard/di.js@master", ["github:Bizboard/di.js@master/index"], function($__export) {
  "use strict";
  var __moduleName = "github:Bizboard/di.js@master";
  var $__exportNames = {};
  return {
    setters: [function($__m) {
      Object.keys($__m).forEach(function(p) {
        if (!$__exportNames[p])
          $__export(p, $__m[p]);
      });
    }],
    execute: function() {}
  };
});

System.register("datasources/FirebaseDataSource", ["utils/objectHelper", "core/DataSource", "github:firebase/firebase-bower@2.2.4", "github:Bizboard/di.js@master"], function($__export) {
  "use strict";
  var __moduleName = "datasources/FirebaseDataSource";
  var ObjectHelper,
      DataSource,
      Firebase,
      Provide,
      annotate,
      FirebaseDataSource;
  return {
    setters: [function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      DataSource = $__m.DataSource;
    }, function($__m) {
      Firebase = $__m.default;
    }, function($__m) {
      Provide = $__m.Provide;
      annotate = $__m.annotate;
    }],
    execute: function() {
      FirebaseDataSource = (function($__super) {
        function FirebaseDataSource(path) {
          $traceurRuntime.superConstructor(FirebaseDataSource).call(this, path);
          this._onValueCallback = null;
          this._onAddCallback = null;
          this._onChangeCallback = null;
          this._onMoveCallback = null;
          this._onRemoveCallback = null;
          this._dataReference = new Firebase(path);
          ObjectHelper.bindAllMethods(this, this);
        }
        return ($traceurRuntime.createClass)(FirebaseDataSource, {
          get dataReference() {
            return this._dataReference;
          },
          set dataReference(value) {
            this._dataReference = value;
          },
          child: function(childName) {
            return new FirebaseDataSource(this._dataReference.child(childName).toString());
          },
          path: function() {
            return this._dataReference.toString();
          },
          key: function() {
            return this._dataReference.key();
          },
          set: function(newData) {
            return this._dataReference.set(newData);
          },
          remove: function() {
            return this._dataReference.remove();
          },
          push: function(newData) {
            return new FirebaseDataSource(this._dataReference.push(newData).toString());
          },
          setWithPriority: function(newData, priority) {
            return this._dataReference.setWithPriority(newData, priority);
          },
          setPriority: function(newPriority) {
            return this._dataReference.setPriority(newPriority);
          },
          setValueChangedCallback: function(callback) {
            this._onValueCallback = callback;
            this._dataReference.on('value', this._onValueCallback);
          },
          removeValueChangedCallback: function() {
            if (this._onValueCallback) {
              this._dataReference.off('value', this._onValueCallback);
              this._onValueCallback = null;
            }
          },
          setChildAddedCallback: function(callback) {
            var $__0 = this;
            this._onAddCallback = callback;
            this._dataReference.on('child_added', (function(newChildSnapshot, prevChildName) {
              $__0._onAddCallback(newChildSnapshot);
            }));
          },
          removeChildAddedCallback: function() {
            if (this._onAddCallback) {
              this._dataReference.off('child_added', this._onAddCallback);
              this._onAddCallback = null;
            }
          },
          setChildChangedCallback: function(callback) {
            var $__0 = this;
            this._onChangeCallback = callback;
            this._dataReference.on('child_changed', (function(newChildSnapshot, prevChildName) {
              $__0._onChangeCallback(newChildSnapshot);
            }));
          },
          removeChildChangedCallback: function() {
            if (this._onChangeCallback) {
              this._dataReference.off('child_added', this._onChangeCallback);
              this._onChangeCallback = null;
            }
          },
          setChildMovedCallback: function(callback) {
            var $__0 = this;
            this._onMoveCallback = callback;
            this._dataReference.on('child_moved', (function(newChildSnapshot, prevChildName) {
              $__0._onMoveCallback(newChildSnapshot);
            }));
          },
          removeChildMovedCallback: function() {
            if (this._onMoveCallback) {
              this._dataReference.off('child_moved', this._onMoveCallback);
              this._onMoveCallback = null;
            }
          },
          setChildRemovedCallback: function(callback) {
            this._onRemoveCallback = callback;
            this._dataReference.on('child_removed', this._onRemoveCallback);
          },
          removeChildRemovedCallback: function() {
            if (this._onRemoveCallback) {
              this._dataReference.off('child_removed', this._onRemoveCallback);
              this._onRemoveCallback = null;
            }
          }
        }, {}, $__super);
      }(DataSource));
      $__export("FirebaseDataSource", FirebaseDataSource);
      annotate(FirebaseDataSource, new Provide(DataSource));
    }
  };
});

System.register("core/Model", ["npm:lodash@3.8.0", "core/Model/prioritisedObject", "core/DataSource", "utils/objectHelper", "github:Bizboard/arva-context@master/Context"], function($__export) {
  "use strict";
  var __moduleName = "core/Model";
  var _,
      PrioritisedObject,
      DataSource,
      ObjectHelper,
      Context;
  return {
    setters: [function($__m) {
      _ = $__m.default;
    }, function($__m) {
      PrioritisedObject = $__m.default;
    }, function($__m) {
      DataSource = $__m.DataSource;
    }, function($__m) {
      ObjectHelper = $__m.default;
    }, function($__m) {
      Context = $__m.Context;
    }],
    execute: function() {
      $__export('default', (function($__super) {
        function Model(id) {
          var data = arguments[1] !== (void 0) ? arguments[1] : null;
          var options = arguments[2] !== (void 0) ? arguments[2] : {};
          var dataSource = Context.getContext().get(DataSource);
          if (id) {
            if (options.dataSource)
              dataSource = options.dataSource;
            else if (options.path)
              dataSource = dataSource.child(options.path);
          } else {
            if (options.dataSnapshot) {
              id = options.dataSnapshot.key();
              dataSource = dataSource.child(pathRoot).child(id);
            } else {
              if (options.dataSource)
                dataSource = options.dataSource.push(data);
              else if (options.path)
                dataSource = dataSource.child(options.path).push(data);
              else {
                dataSource = dataSource.child(pathRoot).push(data);
              }
              id = dataSource.key();
            }
          }
          $traceurRuntime.superConstructor(Model).call(this, dataSource, options.dataSnapshot);
          this._id = id;
          var modelName = Object.getPrototypeOf(this).constructor.name;
          var pathRoot = modelName + 's';
          ObjectHelper.hidePropertyFromObject(Object.getPrototypeOf(this), 'id');
          this._replaceModelAccessorsWithDatabinding();
          if (data) {
            this._isBeingWrittenByDatasource = true;
            for (var name in data) {
              if (Object.getOwnPropertyDescriptor(this, name)) {
                var value = data[name];
                this[name] = value;
              }
            }
            this._isBeingWrittenByDatasource = false;
            if (!id)
              this._onSetterTriggered();
          }
        }
        return ($traceurRuntime.createClass)(Model, {_replaceModelAccessorsWithDatabinding: function() {
            var $__0 = this;
            var prototype = Object.getPrototypeOf(this);
            while (prototype.constructor.name !== 'Model') {
              var propNames = Object.getOwnPropertyNames(prototype);
              var $__5 = true;
              var $__6 = false;
              var $__7 = undefined;
              try {
                for (var $__3 = void 0,
                    $__2 = (propNames)[$traceurRuntime.toProperty(Symbol.iterator)](); !($__5 = ($__3 = $__2.next()).done); $__5 = true) {
                  var name = $__3.value;
                  {
                    var descriptor = Object.getOwnPropertyDescriptor(prototype, name);
                    if (descriptor && descriptor.get) {
                      var value = this[name];
                      delete this[name];
                      ObjectHelper.addPropertyToObject(this, name, value, true, true, (function() {
                        $__0._onSetterTriggered();
                      }));
                    }
                  }
                }
              } catch ($__8) {
                $__6 = true;
                $__7 = $__8;
              } finally {
                try {
                  if (!$__5 && $__2.return != null) {
                    $__2.return();
                  }
                } finally {
                  if ($__6) {
                    throw $__7;
                  }
                }
              }
              prototype = Object.getPrototypeOf(prototype);
            }
          }}, {}, $__super);
      }(PrioritisedObject)));
    }
  };
});

System.register("main", ["core/DataSource", "core/Model", "datasources/FirebaseDataSource", "datasources/SharePointSoapDataSource"], function($__export) {
  "use strict";
  var __moduleName = "main";
  var $__exportNames = {};
  var $__exportNames = {};
  var $__exportNames = {};
  var $__exportNames = {};
  return {
    setters: [function($__m) {
      Object.keys($__m).forEach(function(p) {
        if (!$__exportNames[p])
          $__export(p, $__m[p]);
      });
    }, function($__m) {
      Object.keys($__m).forEach(function(p) {
        if (!$__exportNames[p])
          $__export(p, $__m[p]);
      });
    }, function($__m) {
      Object.keys($__m).forEach(function(p) {
        if (!$__exportNames[p])
          $__export(p, $__m[p]);
      });
    }, function($__m) {
      Object.keys($__m).forEach(function(p) {
        if (!$__exportNames[p])
          $__export(p, $__m[p]);
      });
    }],
    execute: function() {}
  };
});

(function() {
  var loader = System;
  if (typeof indexOf == 'undefined')
    indexOf = Array.prototype.indexOf;

  function readGlobalProperty(p, value) {
    var pParts = p.split('.');
    while (pParts.length)
      value = value[pParts.shift()];
    return value;
  }

  var ignoredGlobalProps = ['sessionStorage', 'localStorage', 'clipboardData', 'frames', 'external'];

  var hasOwnProperty = loader.global.hasOwnProperty;

  function iterateGlobals(callback) {
    if (Object.keys)
      Object.keys(loader.global).forEach(callback);
    else
      for (var g in loader.global) {
        if (!hasOwnProperty.call(loader.global, g))
          continue;
        callback(g);
      }
  }

  function forEachGlobal(callback) {
    iterateGlobals(function(globalName) {
      if (indexOf.call(ignoredGlobalProps, globalName) != -1)
        return;
      try {
        var value = loader.global[globalName];
      }
      catch(e) {
        ignoredGlobalProps.push(globalName);
      }
      callback(globalName, value);
    });
  }

  var moduleGlobals = {};

  var globalSnapshot;

  loader.set('@@global-helpers', loader.newModule({
    prepareGlobal: function(moduleName, deps) {
      // first, we add all the dependency modules to the global
      for (var i = 0; i < deps.length; i++) {
        var moduleGlobal = moduleGlobals[deps[i]];
        if (moduleGlobal)
          for (var m in moduleGlobal)
            loader.global[m] = moduleGlobal[m];
      }

      // now store a complete copy of the global object
      // in order to detect changes
      globalSnapshot = {};
      
      forEachGlobal(function(name, value) {
        globalSnapshot[name] = value;
      });
    },
    retrieveGlobal: function(moduleName, exportName, init) {
      var singleGlobal;
      var multipleExports;
      var exports = {};

      // run init
      if (init)
        singleGlobal = init.call(loader.global);

      // check for global changes, creating the globalObject for the module
      // if many globals, then a module object for those is created
      // if one global, then that is the module directly
      else if (exportName) {
        var firstPart = exportName.split('.')[0];
        singleGlobal = readGlobalProperty(exportName, loader.global);
        exports[firstPart] = loader.global[firstPart];
      }

      else {
        forEachGlobal(function(name, value) {
          if (globalSnapshot[name] === value)
            return;
          if (typeof value === 'undefined')
            return;
          exports[name] = value;
          if (typeof singleGlobal !== 'undefined') {
            if (!multipleExports && singleGlobal !== value)
              multipleExports = true;
          }
          else {
            singleGlobal = value;
          }
        });
      }

      moduleGlobals[moduleName] = exports;

      return multipleExports ? exports : singleGlobal;
    }
  }));
})();
});
//# sourceMappingURL=arva-ds.js.map