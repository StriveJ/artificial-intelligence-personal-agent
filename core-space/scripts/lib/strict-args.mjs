// strict args
export const UPGRADE_ARGS={values:['root','artifact','package','url','sha256','remote','version','commit','channel','subscribe','sid'],flags:['apply','recover','repair-source','allow-downgrade','framework-only','pin','unpin','list','check']};
export const modernUpgradeArgs=args=>args.some(token=>token.startsWith('--')&&!['root','remote','channel'].includes(token.slice(2)));
export function strictArgs(args,{values=[],flags=[],repeat=[]}={}) {
  const out={};
  for(let i=0;i<args.length;i++){
    const token=args[i];if(!token.startsWith('--'))throw new Error("Invalid argument: "+token);
    const key=token.slice(2);if(!values.includes(key)&&!flags.includes(key)&&!repeat.includes(key))throw new Error("Unknown argument: "+token);
    if(Object.hasOwn(out,key)&&!repeat.includes(key))throw new Error("Duplicate argument: "+token);
    if(flags.includes(key)){out[key]=true;continue;}
    const value=args[++i];if(!value||value.startsWith('--'))throw new Error("Missing argument value: "+token);
    if(repeat.includes(key))(out[key]||=[]).push(value);else out[key]=value;
  }
  return out;
}
