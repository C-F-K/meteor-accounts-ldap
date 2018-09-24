Package.describe({
  name: 'cfk:accounts-ldap',
  version: '1.2',
  summary: 'Fork of typ\'s accounts-ldap; the code doesn\'t suck this time',
  git: 'https://github.com/C-F-K/meteor-accounts-ldap',
  documentation: 'README.md'
});

Npm.depends({
//   jsencrypt: '3.0.0-rc.1'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0.3.1');

  api.use(['templating'], 'client');
  api.use(['typ:ldapjs@0.7.3'], 'server');

  api.use('accounts-base', 'server');
  api.imply('accounts-base', ['client', 'server']);
  api.imply('accounts-password', ['client', 'server']);
  api.imply('underscore', ['client', 'server']);
  
  api.use('session', 'client');

  api.use('check');

  api.addFiles(['ldap_client.js'], 'client');
  api.addFiles(['ldap_server.js'], 'server');

  api.export('LDAP', 'server');
  api.export('LDAP_DEFAULTS', 'server');
});
