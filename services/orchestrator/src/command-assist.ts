export type FitCoreCommandAssistResult = Readonly<{
  matchedRule: string | null;
  suggestion: string | null;
  explanation: string;
  risk: "none" | "low" | "review" | "blocked";
  requiresApproval: boolean;
  autoExecute: false;
}>;

function safeBranch(value: string) {
  const branch = value.trim();
  return /^[A-Za-z0-9._/-]{1,160}$/.test(branch) ? branch : null;
}

function containsPrivilegedIntent(command: string) {
  const normalized = command.toLowerCase();
  return ["sudo ", " su ", "chmod ", "chown ", "mkfs", "iptables", "passwd "]
    .some((token) => ` ${normalized} `.includes(token));
}

function containsDestructiveIntent(command: string) {
  const normalized = command.toLowerCase();
  const destructive = ["delete ", "drop table", "truncate ", "force push", "reset --hard"];
  return destructive.some((token) => normalized.includes(token));
}

export function suggestFitCoreCommandCorrection(command: string, output: string): FitCoreCommandAssistResult {
  const attempted = String(command || "").trim().slice(0, 2000);
  const observed = String(output || "").slice(0, 8000);

  if (containsPrivilegedIntent(attempted) || containsDestructiveIntent(attempted)) {
    return {
      matchedRule: "unsafe-command-boundary",
      suggestion: null,
      explanation: "O comando exige revisão operacional; o assistente não propõe nem executa correções privilegiadas ou destrutivas.",
      risk: "blocked",
      requiresApproval: true,
      autoExecute: false,
    };
  }

  const upstreamMatch = observed.match(/git push --set-upstream origin ([A-Za-z0-9._/-]+)/i);
  const branch = upstreamMatch ? safeBranch(upstreamMatch[1]) : null;
  if (branch) {
    return {
      matchedRule: "git-missing-upstream",
      suggestion: `git push --set-upstream origin ${branch}`,
      explanation: "O Git informou que a branch ainda não possui upstream configurado.",
      risk: "review",
      requiresApproval: true,
      autoExecute: false,
    };
  }

  if (/missing script|unknown script/i.test(observed) && /^npm\b/.test(attempted)) {
    return {
      matchedRule: "npm-missing-script",
      suggestion: "npm run",
      explanation: "Liste os scripts existentes antes de escolher outra ação.",
      risk: "low",
      requiresApproval: true,
      autoExecute: false,
    };
  }

  if (/permission denied|operation not permitted/i.test(observed)) {
    return {
      matchedRule: "permission-boundary",
      suggestion: null,
      explanation: "Permissão insuficiente deve ser investigada; elevar privilégio automaticamente é proibido.",
      risk: "blocked",
      requiresApproval: true,
      autoExecute: false,
    };
  }

  if (/command not found|not recognized as an internal or external command/i.test(observed)) {
    return {
      matchedRule: "command-not-found",
      suggestion: null,
      explanation: "O executável não foi encontrado. Confirme o nome e a instalação antes de qualquer alteração.",
      risk: "review",
      requiresApproval: true,
      autoExecute: false,
    };
  }

  return {
    matchedRule: null,
    suggestion: null,
    explanation: "Nenhuma correção determinística e segura foi identificada.",
    risk: "none",
    requiresApproval: false,
    autoExecute: false,
  };
}
