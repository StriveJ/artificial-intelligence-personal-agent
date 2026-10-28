// release channel
export const CHANNELS = ['stable', 'beta'];

const BRANCH_OF = { stable: 'master', beta: 'beta' };
export function branchOfChannel(channel){
  return BRANCH_OF[String(channel||'').trim()] || BRANCH_OF.stable;
}

export function isChannel(channel){
  return CHANNELS.includes(String(channel||'').trim());
}

const CHANNEL_OF_ORIGIN_BRANCH = { dev: 'beta', master: 'stable' };
export function channelOfOriginBranch(branch){
  const key=String(branch||'').trim();
  return Object.hasOwn(CHANNEL_OF_ORIGIN_BRANCH,key)?CHANNEL_OF_ORIGIN_BRANCH[key]:'';
}
