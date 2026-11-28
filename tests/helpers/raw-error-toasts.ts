import ts from "typescript";

/**
 * Toasts that show an error's own text (`toast.error(err.message || "Failed")`): the system's
 * English sentence or a bare code on a merchant's screen. Read through `getFriendlyErrorMessage`
 * instead. An error handed to another call first (a screen's own code reader) is not counted.
 */
const ERROR_NAME = /^(e|ex|err|error|caught|reason)$|(Err|Error)$/;

function strip(node: ts.Node): ts.Node {
  let n = node;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) {
    n = n.expression;
  }
  return n;
}

function isRawMessage(node: ts.Node): boolean {
  const n = strip(node);
  if (!ts.isPropertyAccessExpression(n) || n.name.text !== "message") return false;
  const target = strip(n.expression);
  const name = ts.isIdentifier(target)
    ? target.text
    : ts.isPropertyAccessExpression(target)
      ? target.name.text
      : "";
  return ERROR_NAME.test(name);
}

function isToast(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "toast" &&
    ["error", "warning"].includes(node.expression.name.text)
  );
}

/** The lines (1-based) of a file's source where a toast shows an error's raw text. */
export function rawErrorToasts(source: string): number[] {
  if (!source.includes("toast.")) return [];
  const sf = ts.createSourceFile("file.tsx", source, ts.ScriptTarget.Latest, true);
  const found: number[] = [];
  const visit = (node: ts.Node, inToast: boolean) => {
    if (inToast && isRawMessage(node)) {
      found.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      return;
    }
    const next = isToast(node) ? true : ts.isCallExpression(node) ? false : inToast;
    ts.forEachChild(node, (child) =>
      visit(child, next && !(isToast(node) && child === node.expression)),
    );
  };
  visit(sf, false);
  return found;
}
