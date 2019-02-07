Package.describe({
  name: 'cfk:accounts-ldap',
  version: '1.4.10',
  summary: 'A hopefully generic and secure package for LDAP auth',
  git: 'https://github.com/C-F-K/meteor-accounts-ldap',
  documentation: 'README.md'
});

Npm.depends({
  'node-rsa': '1.0.1'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0.3.1');

  api.use(['templating'], 'client');
  api.use(['typ:ldapjs@0.7.3'], 'server');

  api.use('accounts-base', 'server');
  api.use('mongo', ['client','server']);
  api.imply('accounts-base', ['client', 'server']);
  api.imply('accounts-password', ['client', 'server']);
  api.imply('underscore', ['client', 'server']);
  
  
  api.use('session', 'client');
  api.use('check');

  api.addFiles(['bundle.js'],'client',true);

  api.export('LDAP', 'server');
  api.export('LDAP_DEFAULTS', 'server');

  api.mainModule('ldap_server.js','server');
  api.mainModule('ldap_client.js','client');
});
