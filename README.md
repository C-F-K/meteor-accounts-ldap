Meteor Package accounts-ldap
============================

This is a fork of `typ:accounts-ldap`. The less said about that package, the better.

## New stuff

`LDAP_DEFAULTS.customProps` : drop an object here to add it to the created user document (uses underscore's `_.defaults`, and obviously only works if createNewUser is enabled)

`LDAP_DEFAULTS.customProfileFunc` : drop a `function(entry){ /* etc */ }` here to define any additional processing you want to do on the `ldapjs.entry.object` object; return an object which will be `_.extend`ed onto the user's `profile` field

`LDAP_DEFAULTS.customSearchAttributes` : strings in this array will be used to specify the attributes to retrieve when searching for a user; will be exposed on the `entry` argument to `customProfileFunc`. Default is an empty array, which makes `ldapjs` return all attributes (this functionality may have existed in the original package; I've refactored it so much I forget)

In addition, the package now uses public-key crypto (by way of `node-rsa`, which was packaged for the client with Browserify) to seal the user's creds before sending them to the server for authentication. This addresses the hole common to every other LDAP package I was able to find. Keypairs are generated each time the app starts; you can probably hack this pretty easily into doing it more frequently.