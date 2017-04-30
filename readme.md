# Conditions
[TODO] This document needs an overhaul

## Quick start
A convenience loader is supplied which allows `FS` and `HTTP` loading in node, and `HTTP` loading in
the browser.

`npm install conditions` or `bower install conditions`

`npm install conditions`

`conditions('config/production', process.NODE_ENV === 'development' ? 'config/development' : '')`

### Notes on the paths
A relative path is set relative to the page in the browser, and the current working
directory in node. If an absolute path is received, it will override this relative path. If a
`URL` is supplied the domain will become part of the base and a `file://` URI should be used to
clear the HTTP part from the base if desired (and set a new base since we always expect an absolute
location.) Some examples below.

To load a file named `production` in the `config` directory found in the current working
directory (`process.cwd()`), then extend it with `development` and `local`, which are also
found in the `config` directory.
* `conditions('/config/production', 'development', 'local')`

To load a file from `http://example.com/config/production`, extend it with a file from
`http://example.com/config/production`, extend it with a file `local1` from the `config` directory,
then with a file `local2`, also from the `config` directory.
* `conditions('http://example.com/config/production', 'development', 'file:///config/local1', 'local2')`

## About conditions
Conditions aims to be a fully fledged configuration manager for javascript. It contains 3 main
components which are documented below:
* Parser - Responsible for generating a configuration object or array from the supplied source
    string.
* Loader - Responsible for looking through an object, finding properties which contain the given
    prefix, and calling the supplied loader function.
* Extender (levels) - Allows configuration objects to extend other objects while preserving things
    like prototype properties, and getter expressions. This also allows advanced manipulation
    of arrays.

### Gotchas
* When setting an object value onto a config object, the object will be deep cloned and replaced
    with config objects.
TODO: A sample of this and any other strange or unusual things...

# Parser
The core component of the conditions library. It parses config files and produces objects or
arrays through which the configuration can be accessed.

The parser has the following signature

    function parser(src, options) {
        ...
    }

And returns an `object` or an `array`.

## Options
The following options are available when calling the parser:

* **protectStructure** - When set to true, all property definitions in the configuration will be set
    to non-configurable.
* **readOnly** - When set to true, all value properties in the configuration will be set to
    non-writable.
* **environment** - An object containing identifiers to be made available to the expressions. This will
    be attached to the prototype of every object in the configuration as a property named from
    `parser.PROPERTY_PROTOTYPE_ENVIRONMENT` (defaults to `$environment`). If
    `parser.PROPERTY_PROTOTYPE_ENVIRONMENT` is falsy, the property will not be set.

## Configuration file format

    {
        "string property": "foo bar",
        num: 100,
        bool: true,
        regexp: /yeah/,
        subobjects: {
            "sure": ['and', 'arrays','too','(', 'You can also define an array as the root', ')']
        },
        expression: this['string property'] + num
    }

### Supported value types
Strings, numbers, booleans and regular expressions are supported. You can define sub objects, and
also arrays. You can also define expressions which can access values in the current object directly
by name, or through the "this" value (mainly for properties whose name is not definable directly.
For example, a property named "foo bar" cannot be referenced directly through valid script,
so this["foo bar"] is made available for this purpose).

Expressions are also able to reference other objects in the configuration hierarchy by referencing
the desired objects through their id value (described below). When an expression is part of an
extending configuration the `base` identifier can be used to access the underlying value, the
`source` identifier can be used to access the underlying config at its root, and any objects
declared with id properties will be available to the extending config expressions. Note: `source`
and the locals from the source will only be available if `options.source` and / or
`options.locals` are truthy.


### id property
The special id property can be used as follows to provide cross object references. The id property
is only considered as a reference id if the name is provided without quotes. If the name has quotes,
the id property is considered to be a part of the configuration.
An id identifier is not stored directly on the resulting configuration object, but rather on the
`prototype` so that if an id config value is defined it will still be available on the config
object.

    {
        id: root,
        id: "Configuration property",
        val: 10,
        sub: {
            id: sub,
            subval: 10
        },
        sub2: {
            val: root.val + sub.val
        }
    }

An inspection of the values on this object should produce something like:

    {
        id: "Configuration property",
        val: 10,
        sub: {
            subval: 10
        },
        sub2: {
            val: 20
        }
    }

with a prototype of:

    {
        id: "root",
        ...
    }

Note: As you change `sub.subval`, subsequent calls to `sub2.val` will result in different values.

### Real world example
Consider the following example of server configuration. If we were using plain JSON, we would have to update multiple values (server.url, site.home and site.api) when changing, for example, the port.

     {
        server: {
            id: server,
            port: 8080,
            host: 'example.com',
            secure: false,
            protocol: secure ? 'https' : 'http',
            url: protocol + '://' + host + ':' + port + '/'
        },

        site: {
            home: server.url + 'index.html',
            api: `${server.url}api/`
        }
     }

# Loader
The loader is responsible for scanning a configuration object for properties with a defined
prefix (`$` by default) and passing the values of those properties to a loader function. The
results from the loader function (Provided wither directly or by promise), are then attached to
a newly generated object (cloned from the supplied configuration object).

The loader has the following signature:

    function loader(config, loader, options) {
        ...
    }

Where `config` is the configuration object to scan, `loader` is a function with the expected
signature `function loadResource(value) { ... }` where value is the value of the property,
and the return can be a value to assign, or a promise which will be resolved, and then assigned.
The `loader` function always returns a promise which is resolved once all resources have been
loaded. Note: If the loader returns a string, it will be parsed with the parser.

## Options
* **prefix** - The prefix value to search for. Defaults to `$`.
* **prefixStrip** - True to remove the prefix for loaded properties so the final object has the
    property value sans prefix.
* **source** - Truthy, or a function (which will be passed the property name and the value that
    was passed to the loader) to filter. If truthy result, an environment variable `source` will
    be passed to the loaded configurations which will reference the root of the current
    configuration.
* **locals** - Truthy, or a function (which will be passed the property name and the value that
    was passed to the loader) to filter. If truthy result, all configuration objects with ids will
    be passed as local variables to loaded configuration.
* **protectStructure** - When set to true, all property definitions in the configuration will be set
    to non-configurable.
* **readOnly** - When set to true, all value properties in the configuration will be set to
    non-writable.
* **environment** - An object containing identifiers to be made available to the expressions
    when calling the parser

# Extender (Levels)
The extender is designed to allow configuration levels to be defined and used. It is a system which
allows the underlying object to be extended using prototypes so that while final values may be
different, no data is lost (Since the original values are on the prototype) unless explicitly
removed (by setting a property to `undefined`).

The extender has the following signature:

    function levels(config, levels, options) {
        ...
    }

Where `config` is the configuration to extend. `levels` is an array of values to extend the config
with, and `options` defines how the extension takes place.

## Options
* **protectStructure** - When set to true, all property definitions in the configuration will be set
    to non-configurable.
* **readOnly** - When set to true, all value properties in the configuration will be set to
    non-writable.

## Array commands
When extending an array commands may be used for manipulation of the array. Commands will only be
applied if every item in the array is a valid command (By default, an object containing exactly
one property named `$`.).

For commands where it is appropriate, the `find` property is used for searching, and behaves as
follows: It will match if it matches the array value explicitly or, if it is an object and the
array value is an object, if every property matches every property of the same name on the
array element.

The following commands may be issues:
* **add** - Adds the value defined in the property `value` to the end of the array.
* **remove** - Removes a value from the array. The `find` (See above) property is used to
    determine which element to remove.
* **update** - Replaces an element in the array. The `find` (See above) property is used to
    determine which element to replace.
* **extend** - Runs the standard extend procedure on an element in the array. The `find`
    (See above) property is used to determine which element to replace.
* **clear** - Removed all items from the array.

# Features for V2
* Resource saver
* Object commands (Things like combining to references)

# Roadmap to V1.0.0

* Work
    * resource-loader mock (should be available directly through index.js)
    * Ensure config file and locations are reported on syntax errors.
    * Test level loading (and make it more flexible in terms of supplied values?)
    * Allow import to specify a directory (rather a new import function... $importFrom?)
        * Looks for index.config and Loads
            * If we have an array, we pass that array to the standard import.
        * Otherwise we set the import to undefined
    * Complete ESLint configs
    * examples
    * documentation
* Systems
    * travis CI
    * codecov.io
* Tests
    * Highly complex sample config
    * Node acceptance testing
    * Loader must throw an error on duplicate ids (But not levels)
    * Deal with unhandled promise rejection....
