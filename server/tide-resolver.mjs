export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && context.parentURL) {
      for (const suffix of [".js", "/index.js"]) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          // Try the next extension before rethrowing the original failure.
        }
      }
    }
    throw error;
  }
}
