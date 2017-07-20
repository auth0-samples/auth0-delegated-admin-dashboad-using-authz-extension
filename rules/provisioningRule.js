function provisioningRule (user, context, callback) {  
  var LOG_PREFIX = 'provisioningRule: ';

  // configure these:
  var FEDERATED_CONNECTIONS = ['federated-connection1', 'federated-connection2'];
  var FEDERATED_PROVISIONED_USERS_CONNECTION = 'federated-provisioned-users-connection';
  var IN_PLACE_PROVISIONING_CONNECTIONS = ['db-connection1', 'db-connection2'];

  var Promise = require('bluebird');
  var request = require('request-promise');

  var isFederatedProvisioning = FEDERATED_CONNECTIONS.indexOf(context.connection) !== -1;
  console.log(LOG_PREFIX + 'federated provisioning?', isFederatedProvisioning);
  
  var isInPlaceProvisioning = IN_PLACE_PROVISIONING_CONNECTIONS.indexOf(context.connection) !== -1 && 
    user.app_metadata !== undefined && user.app_metadata.memberships !== undefined;
  console.log(LOG_PREFIX + 'in-place provisioning?', isInPlaceProvisioning);
  
  // exit if no provisioning work is needed
  if (!isFederatedProvisioning && !isInPlaceProvisioning) {
    console.log(LOG_PREFIX + 'No provisioning needed.');
    
    return callback(null, user, context);
  }

  function clientCredentials (audience) {
    return request.post({
      url: 'https://' + auth0.domain + '/oauth/token',
      json:{
        grant_type: 'client_credentials',
        client_id: configuration.PROVISIONING_RULE_CLIENT_ID,
        client_secret: configuration.PROVISIONING_RULE_CLIENT_SECRET,
        audience: audience
      }
    })
    .then(function (body) {
      return body.access_token;
    });
  }

  function fetchAccessTokens () {
    if (global.accessTokens) {
      console.log(LOG_PREFIX + 'Using cached access tokens');

      return Promise.resolve();
    }

    console.log(LOG_PREFIX + 'Fetching access tokens and loading them into cache');
    return Promise.props({
      managementApi: clientCredentials('https://' + auth0.domain + '/api/v2/'),
      authZ: clientCredentials('urn:auth0-authz-api')
    }).then(function (accessTokens) {
      // set cache
      global.accessTokens = accessTokens;
    });
  }

  return fetchAccessTokens()
    .then(function () {
      if (isInPlaceProvisioning) {
        // no user in a different connection
        return [];
      }

      // try to find a matching federated provisioned user
      return request.get({
        url: 'https://' + auth0.domain + '/api/v2/users',
        qs: {
          search_engine: 'v2',
          q: 'connection: "' + FEDERATED_PROVISIONED_USERS_CONNECTION + '" AND email: "' + user.email + '"'
        },
        auth: { bearer: global.accessTokens.managementApi },
        json: true
      });
    })
    .then(function (users) {  
      // exit if no matching federated users 
      if (isFederatedProvisioning && users.length === 0) {
        console.log(LOG_PREFIX + 'No matching federated provisioned user found.');
        return;
      }

      var provisionedUser = isFederatedProvisioning ? users[0] : user;

      function deleteProvisionedUser () {
        console.log(LOG_PREFIX + 'Deleting federated provisioned user:', provisionedUser.user_id);

        return request.delete({
          url: 'https://' + auth0.domain + '/api/v2/users/' + provisionedUser.user_id,
          auth: { bearer: global.accessTokens.managementApi }
        });
      }

      // just delete the provisioned user if no membership data
      if (isFederatedProvisioning && (!provisionedUser.app_metadata || !provisionedUser.app_metadata.memberships)) {
        console.log(LOG_PREFIX + 'Federated provisioned user had no memberships');

        return deleteProvisionedUser();
      }

      // fetch user's existing roles
      return request.get({
        url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
        auth: { bearer: global.accessTokens.authZ },
        json: true
      })
      .then(function (existingRoles) {
        var existingRoleIds = existingRoles.map(function (role) {
          return role._id;
        });

        // delete existing roles if any
        if (existingRoleIds.length > 0) {
          console.log(LOG_PREFIX + 'Removing user ' + user.user_id + ' from existing roles:', existingRoleIds);

          return request.delete({
            url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
            auth: { bearer: global.accessTokens.authZ },
            json: existingRoleIds
          });        
        }
      })
      // fetch all roles data, if not already cached
      .then(function () {
        if (global.rolesByName) {
          console.log(LOG_PREFIX + 'Using cached roles list');

          return global.rolesByName;
        }

        console.log(LOG_PREFIX + 'Fetching all roles and loading them into cache');
        return request.get({
          url: configuration.AUTHZ_API_BASE_URL + '/roles',
          auth: { bearer: global.accessTokens.authZ },
          json: true
        })
        .then(function (rolesData) {
          global.rolesByName = {};
          for (var i in rolesData.roles) {
            var role = rolesData.roles[i];
            global.rolesByName[role.name] = role;
          }

          return global.rolesByName;
        });      
      })
      // convert provisioned memberships (role names) into role IDs
      .then(function (rolesByName) {
        return provisionedUser.app_metadata.memberships.map(function (membership) {
          return rolesByName[membership]._id;
        });
      })
      // update user with new roles
      .then(function (newRoleIds) {
        console.log(LOG_PREFIX + 'Updating user ' + user.user_id + ' with new role IDs', newRoleIds);

        return request.patch({
          url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
          auth: { bearer: global.accessTokens.authZ },
          json: newRoleIds
        });      
      })
      // remove provisioning app_metadata from in-place provisioned user
      .then(function () {
        if (isInPlaceProvisioning) {
          console.log(LOG_PREFIX + 'Removing provisioning app_metadata from in-place provisioned user ' + user.user_id);

          delete user.app_metadata.memberships;

          return request.patch({
            url: 'https://' + auth0.domain + '/api/v2/users/' + user.user_id,
            auth: { bearer: global.accessTokens.managementApi },
            json: {
              app_metadata: user.app_metadata
            }
          });
        }
      })
      // delete federated provisioned user
      .then(function () {
        if (isFederatedProvisioning) {
          return deleteProvisionedUser();
        }
      });
  })
  // success
  .then(function () {
    console.log(LOG_PREFIX + 'Done.');

    return callback(null, user, context);
  })
  // error
  .catch(function (err) {
    console.log(LOG_PREFIX + 'Error:', err);
    return callback(err);
  });
}
