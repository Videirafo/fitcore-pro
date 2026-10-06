import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root=process.cwd();
const configPath=path.join(root,"launch.config.json");
if(!fs.existsSync(configPath)){console.error("launch.config.json not found");process.exit(1);}
const config=JSON.parse(fs.readFileSync(configPath,"utf8"));
const git=(args)=>{try{return execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{return null;}};
const outputDir=path.join(root,process.env.LAUNCH_EVIDENCE_DIR||"launch-evidence");
fs.mkdirSync(outputDir,{recursive:true});
const sha=process.env.GITHUB_SHA||git(["rev-parse","HEAD"]);
const branch=process.env.GITHUB_REF_NAME||git(["branch","--show-current"]);
const repository=process.env.GITHUB_REPOSITORY||git(["config","--get","remote.origin.url"]);
const recentCommitsRaw=git(["log","-5","--pretty=format:%H%x09%s"])||"";
const recentCommits=recentCommitsRaw.split("\n").filter(Boolean).map((line)=>{const parts=line.split("\t");return{sha:parts.shift(),message:parts.join("\t")};});
const evidence={schemaVersion:1,generatedAt:new Date().toISOString(),project:config.project,kind:config.kind,repository,sha,branch,feature:process.env.LAUNCH_FEATURE||"unspecified",prNumber:process.env.LAUNCH_PR_NUMBER||null,ciState:process.env.LAUNCH_CI_STATE||(process.env.GITHUB_ACTIONS?"workflow-running":"local"),deploymentState:process.env.LAUNCH_DEPLOYMENT_STATE||"unknown",deploymentUrl:process.env.LAUNCH_DEPLOYMENT_URL||null,recentCommits};
fs.writeFileSync(path.join(outputDir,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");
const notes=["# Release Evidence","", "- Project: "+evidence.project,"- Feature: "+evidence.feature,"- Repository: "+(evidence.repository||"unknown"),"- SHA: "+(evidence.sha||"unknown"),"- Branch/ref: "+(evidence.branch||"unknown"),"- PR: "+(evidence.prNumber||"not supplied"),"- CI: "+evidence.ciState,"- Deployment: "+evidence.deploymentState,"- URL: "+(evidence.deploymentUrl||"not supplied"),"","## Recent commits",...recentCommits.map((item)=>"- "+(item.sha?item.sha.slice(0,12):"unknown")+" — "+item.message)].join("\n");
fs.writeFileSync(path.join(outputDir,"release-notes.md"),notes+"\n");
console.log("Launch evidence written to "+path.relative(root,outputDir));
