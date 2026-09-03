declare const brandSymbol: unique symbol

/**
 * Attaches a nominal tag to a primitive type so structurally identical
 * primitives (e.g. two different ID kinds that are both `string`) remain
 * distinct at the type level. The tag has no runtime representation.
 */
export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B }
