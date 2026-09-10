export type FitCoreExecutionRisk = "read" | "workspace-write" | "external-action" | "privileged";

export type FitCoreExecutionRequest = Readonly<{
  risk: FitCoreExecutionRisk;
  workspaceId?: string | null;
  networkHosts?: readonly string[];
  approved?: boolean;
}>;

export type FitCoreExecutionDecision = Readonly<{
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  policy: {
    hostFilesystemAllowed: false;
    privilegedExecutionAllowed: false;
    networkMode: "deny" | "allowlisted";
  };
}>;

const ALLOWED_NETWORK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
]);

function networkAllowed(hosts: readonly string[] = []) {
  return hosts.every((host) => ALLOWED_NETWORK_HOSTS.has(host.toLowerCase()));
}

export function evaluateFitCoreExecution(request: FitCoreExecutionRequest): FitCoreExecutionDecision {
  if (request.risk === "privileged") {
    return {
      allowed: false,
      requiresApproval: true,
      reason: "fitcore_privileged_execution_forbidden",
      policy: { hostFilesystemAllowed: false, privilegedExecutionAllowed: false, networkMode: "deny" },
    };
  }

  if (!networkAllowed(request.networkHosts)) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "fitcore_agent_network_not_allowlisted",
      policy: { hostFilesystemAllowed: false, privilegedExecutionAllowed: false, networkMode: "allowlisted" },
    };
  }

  const requiresApproval = request.risk === "workspace-write" || request.risk === "external-action";
  if (requiresApproval && !request.approved) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: "fitcore_agent_approval_required",
      policy: { hostFilesystemAllowed: false, privilegedExecutionAllowed: false, networkMode: "allowlisted" },
    };
  }

  if (requiresApproval && !request.workspaceId) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: "fitcore_workspace_required",
      policy: { hostFilesystemAllowed: false, privilegedExecutionAllowed: false, networkMode: "allowlisted" },
    };
  }

  return {
    allowed: true,
    requiresApproval,
    reason: "fitcore_execution_allowed",
    policy: {
      hostFilesystemAllowed: false,
      privilegedExecutionAllowed: false,
      networkMode: request.networkHosts?.length ? "allowlisted" : "deny",
    },
  };
}
