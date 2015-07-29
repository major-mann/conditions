#Conditions
##Quick note
This is not yet published on NPM or bower, I am planning on doing so soon.

Conditions aims to be a fully fledged configuration manager for javascript.

In this initial version, the main config format, and parser (as well as tests) are complete, and working well. In future versions, the plan is to add configurtion extension code which will allow things like confiugration levels to be defined, and overridden in a stack based structure and include functions. Possibly event emitters to monitor changes will be added.

#Configuration file format

    {
        "string property": "foo bar",
        num: 100,
        bool: true,
        regexp: /yeah/,
        subobjects: {
            "sure": ['and', 'arrays','too','(', 'You can also define an array as configuration root', ')']
        },
        expression: this['string property'] + num
    }

## Supported value types
Strings, numbers, booleans and regular expressions are supported. You can define sub objects, and also arrays.
You can also define expressions which can access values in the current object directly by name, or through the "this" value (mainly for properties whose name is not definable directly. For example, a property named "foo bar" cannot be referenced directly through valid script, so this["foo bar"] is made available for this
purpose).

Expressions are also able to reference other objects in the configuration hierarchy by referencing the desired objects through their id value (described below).

## id property
The special id property can be used as follows to provide cross object references. The id property is only considered as a reference id if the name is provided without quotes. If the name has quotes, the id property is considered to be a part of the configuration. An id identifier is not stored on the resulting configuration object.

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

## Real world example
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
            api: server.url + 'api/'
        }
     }