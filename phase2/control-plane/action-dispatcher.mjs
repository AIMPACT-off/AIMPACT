export const DISPATCH_RESULTS = Object.freeze(["EXECUTED","NO_HANDLER","FAILED"]);

export function dispatchAction(action, payload, handlers = {}) {
  if (!action) return { status: "NO_HANDLER", code: "ACTION_REQUIRED" };

  const handler = handlers[action];
  if (typeof handler !== "function") {
    return { status: "NO_HANDLER", code: "ACTION_HANDLER_NOT_REGISTERED", action };
  }

  try {
    const result = handler(payload);
    return { status: "EXECUTED", action, result };
  } catch (error) {
    return {
      status: "FAILED",
      code: "ACTION_EXECUTION_FAILED",
      action,
      error: error?.message ?? String(error)
    };
  }
}

export function executeRoutedAction(routeResult, payload, handlers = {}) {
  if (!routeResult?.ok || routeResult.status !== "DISPATCH") {
    return {
      status: "NOT_DISPATCHED",
      code: routeResult?.policy?.code ?? routeResult?.code ?? "ROUTE_NOT_ALLOWED"
    };
  }
  return dispatchAction(routeResult.action, payload, handlers);
}
