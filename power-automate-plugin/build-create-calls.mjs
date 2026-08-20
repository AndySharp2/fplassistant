import { readFileSync, writeFileSync } from 'node:fs';

const definition = JSON.parse(readFileSync('flow-definition.json', 'utf8'));
const connectionRefs = {
  'shared_office365': {
    connectionName: 'shared-office365-968f005c-443d-4ee7-852c-5531625e8f91',
    source: 'Embedded',
    id: '/providers/Microsoft.PowerApps/apis/shared_office365',
    tier: 'NotSpecified',
  },
  'shared_new-5ffantasy-20premier-20league-20api-5f08b15f8a014951ef': {
    connectionName: '78b7dc56438d469ebfa92b13c99e087a',
    source: 'Embedded',
    id: '/providers/Microsoft.PowerApps/apis/shared_new-5ffantasy-20premier-20league-20api-5f08b15f8a014951ef',
    tier: 'NotSpecified',
  },
};

const env = 'd923c0e5-f81e-e58f-84c0-52fac05dacab';

const calls = [
  { tool: 'set_current_env', args: { env } },
  { tool: 'preflight_flow', args: { definition, connectionRefs } },
  {
    tool: 'create_flow',
    args: {
      env,
      name: 'FPL - Weekly Deadline Reminder',
      definition,
      connectionRefs,
      state: 'Stopped',
    },
  },
];

writeFileSync('calls-create.json', JSON.stringify(calls, null, 2));
console.log('wrote calls-create.json');
