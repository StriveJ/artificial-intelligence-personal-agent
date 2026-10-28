// runtime migrate
import { strictArgs } from './lib/strict-args.mjs';
import { migrationPreview,applyRuntimeMigration } from './lib/runtime-migration.mjs';
try{
  const a=strictArgs(process.argv.slice(2),{values:['root'],flags:['apply'],repeat:['untrack']});
  if(!a.root)throw new Error("Explicit --root required; default is preview, --apply performs changes");
  const result=a.apply?applyRuntimeMigration(a.root,{untrack:a.untrack||[]}):migrationPreview(a.root);
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
