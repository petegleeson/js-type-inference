// @flow
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import {
  isBoolT,
  isIntT,
  isStrT,
  isVarT,
  isFuncT,
  isObjT,
  isVoidT,
  getTypes,
  funcT,
  objT,
  varT,
  type Type
} from "./types";

const toObj = obj => (res, k) => (res[k] = obj[k]);

const alphabet = "abcdefghijklmnopqrstuvwxyz";
export const prettyPrint = (type: Type): string => {
  let nextLetter = 0;
  let varLetterMap = {};
  const print = (ty: Type) => {
    if (isBoolT(ty)) {
      return ty.name;
    } else if (isIntT(ty)) {
      return ty.name;
    } else if (isStrT(ty)) {
      return ty.name;
    } else if (isVarT(ty)) {
      if (!varLetterMap[ty.uid]) {
        varLetterMap[ty.uid] = alphabet[nextLetter];
        nextLetter = (nextLetter + 1) % alphabet.length;
      }
      return varLetterMap[ty.uid];
    } else if (isFuncT(ty)) {
      return `(${ty.params.map(print).join(", ")}) => ${print(ty.returns)}`;
    } else if (isObjT(ty)) {
      return `{ ${ty.properties
        .map(([key, tyValue]) => `${key}: ${prettyPrint(tyValue)}`)
        .join(", ")} }`;
    } else if (isVoidT(ty)) {
      return "";
    }
    throw `don't know how to print ${ty.name}`;
  };
  return print(type);
};

type Scheme = { vars: string[], type: Type };
const createScheme = (vars: string[], type: Type): Scheme => ({
  vars,
  type
});

type Context = { [id: string]: Scheme };
export const createCtx = (): Context => ({});

type Substitution = { [id: string]: Type };
export const emptySubst = (): Substitution => ({});
const deleteSubst = (subst: Substitution, keys: string[]): Substitution =>
  Object.keys(subst)
    .filter(k => !keys.includes(k))
    .reduce((res, k) => {
      res[k] = subst[k];
      return res;
    }, {});

export const applySubst = (subst: Substitution, ty: Type): Type => {
  if (isVarT(ty)) {
    return subst[ty.uid] || ty;
  } else if (isFuncT(ty)) {
    return funcT(
      ty.uid,
      ty.params.map(pty => applySubst(subst, pty)),
      applySubst(subst, ty.returns)
    );
  } else if (isBoolT(ty)) {
    return ty;
  } else if (isIntT(ty)) {
    return ty;
  } else if (isStrT(ty)) {
    return ty;
  } else if (isObjT(ty)) {
    return objT(
      ty.uid,
      ty.properties.map(([name, tyProp]) => [name, applySubst(subst, tyProp)])
    );
  }
  throw `cannot apply substution to ${ty.name}`;
};

const applySubstScheme = (
  subst: Substitution,
  { vars, type }: Scheme
): Scheme => {
  return createScheme(vars, applySubst(deleteSubst(subst, vars), type));
};

const applySubstContext = (subst: Substitution, ctx: Context): Context =>
  Object.keys(ctx).reduce((res, k) => {
    res[k] = applySubstScheme(subst, ctx[k]);
    return res;
  }, {});

const composeSubst = (s1: Substitution, s2: Substitution): Substitution => {
  return {
    ...s1,
    ...Object.keys(s2).reduce((subst, k) => {
      subst[k] = applySubst(s1, s2[k]);
      return subst;
    }, {})
  };
};

const instantiate = ({ vars, type }: Scheme): Type => {
  // TODO: this will need to create new uids
  const newVars = vars.map(varT);
  const subst: Substitution = vars.reduce((s, v, i) => {
    s[v] = newVars[i];
    return s;
  }, {});
  return applySubst(subst, type);
};

const varBind = (id: string, ty: Type): Substitution => {
  // a U a
  if (id === ty.name) {
    return emptySubst();
  } else if (
    isFuncT(ty) &&
    (ty.params.find(p => isVarT(p) && p.name === id) ||
      (isVarT(ty.returns) && ty.returns.name === id))
  ) {
    throw `${id} occurs in more complex type ${ty.name}`;
  }
  return {
    [id]: ty
  };
};

const unify = (ty1: Type, ty2: Type): Substitution => {
  if (isIntT(ty1) && isIntT(ty2)) {
    return emptySubst();
  } else if (isBoolT(ty1) && isBoolT(ty2)) {
    return emptySubst();
  } else if (isStrT(ty1) && isStrT(ty2)) {
    return emptySubst();
  } else if (
    isFuncT(ty1) &&
    isFuncT(ty2) &&
    ty1.params.length === ty2.params.length
  ) {
    const s1 = ty1.params.reduce(
      (subst, p1, i) => composeSubst(subst, unify(p1, ty2.params[i])),
      emptySubst()
    );
    const s2 = unify(applySubst(s1, ty1.returns), applySubst(s1, ty2.returns));
    return composeSubst(s1, s2);
  } else if (isVarT(ty1)) {
    return varBind(ty1.uid, ty2);
  } else if (isVarT(ty2)) {
    return varBind(ty2.uid, ty1);
  }
  throw `types do not unify: ${ty1.name} and ${ty2.name}`;
};

const getId = node =>
  `${node.loc.start.line}${node.loc.start.column}${node.loc.end.line}${
    node.loc.end.column
  }`;

const pathData = (subst: Substitution, type: Type) => {
  if (typeof subst !== "object") throw `subst is not an object`;
  return {
    subst,
    type
  };
};

const emptyState = () => {
  const nextId = (() => {
    let id = 0;
    return () => `${++id}`;
  })();
  return {
    context: createCtx(),
    types: getTypes(nextId),
    skip: p => false
  };
};

type Node = { [k: string]: any };

export type Result = {
  subst: Substitution,
  type: Type
};

export type Api = {
  visit: (Node, Context) => Result,
  types: $Call<typeof getTypes, () => "">
};

export type VisitorFn = (
  path: { node: Node },
  context: Context,
  api: Api
) => Result;

export type Visitor = {
  [k: string]: VisitorFn
};

export const visitor: Visitor = {
  enter(path, state = emptyState()) {
    if (state.skip(path)) {
      path.skip();
      return;
    }
  },
  BooleanLiteral(path, state = emptyState()) {
    path.data = pathData(emptySubst(), state.types.boolT());
    nodes[getId(path.node)] = {
      node: path.node,
      ...path.data
    };
  },
  CallExpression(path, state = emptyState()) {
    // console.log("CallExpression");
    const tyRes = state.types.varT();

    path.traverse(visitor, {
      ...state,
      skip: p => path.node.arguments.includes(p.node)
    });
    const { subst: s1, type: tyFun } = path.get("callee").data;

    path.traverse(visitor, {
      ...state,
      context: applySubstContext(s1, state.context),
      skip: p => p.node === path.node.callee
    });

    const tyArgs = path.get("arguments").map(arg => arg.data);
    const s2 = tyArgs.reduce((s, { subst }) => {
      return composeSubst(s, subst);
    }, emptySubst());

    const s3 = unify(
      applySubst(s2, tyFun),
      state.types.funcT(tyArgs.map(a => a.type), tyRes)
    );

    const subst = composeSubst(s3, composeSubst(s2, s1));

    path.data = pathData(subst, applySubst(subst, tyRes));
    nodes[getId(path.node)] = {
      node: path.node,
      ...path.data
    };
    path.skip();
  },
  Function(path, context, { visit, types }) {
    // console.log("Function");
    // add params to context
    const funcContext = path.node.params.reduce(
      (ctx, n) =>
        Object.assign(ctx, { [n.name]: createScheme([], types.varT()) }),
      context
    );
    // infer params type
    let paramSubst = emptySubst();
    const paramTypes = path.node.params.map(n => {
      const { subst, type } = visit(
        n,
        applySubstContext(paramSubst, funcContext)
      );
      paramSubst = composeSubst(paramSubst, subst);
      return type;
    });
    // infer body type
    const { subst: bodySubst, type: bodyType } = visit(
      path.node.body,
      funcContext
    );

    // unify param and body substitutions
    const composedSubst = unify(
      applySubst(paramSubst, types.funcT(paramTypes, bodyType)),
      applySubst(bodySubst, types.funcT(paramTypes, bodyType))
    );

    return pathData(
      composedSubst,
      applySubst(composedSubst, types.funcT(paramTypes, bodyType))
    );
  },
  Identifier(path, context) {
    // console.log("Identifier", path.node.name);
    const scheme = context[path.node.name];
    if (!scheme) throw `${path.node.name} not found in scheme`;
    return pathData(emptySubst(), instantiate(scheme));
  },
  NumericLiteral(path, state = emptyState()) {
    // console.log("NumericLiteral");
    path.data = pathData(emptySubst(), state.types.intT());
    nodes[getId(path.node)] = {
      node: path.node,
      ...path.data
    };
  },
  "Program|BlockStatement"(path, context, { visit, types }) {
    // console.log("Program|BlockStatement");
    const getIds = node => {
      const visitor = {
        VariableDeclaration() {
          return node.declarations.map(getIds);
        },
        VariableDeclarator() {
          return node.id.name;
        }
      };
      return visitor[node.type] ? visitor[node.type]() : [];
    };
    // flatMap ids
    const ids = path.node.body.reduce((curr, n) => curr.concat(getIds(n)), []);
    const blockContext = ids.reduce(
      (ctx, id) =>
        Object.assign(ctx, {
          [id]: createScheme([], types.varT())
        }),
      context
    );
    const composedSubst = path.node.body.reduce((subst, node, i) => {
      // infer
      return composeSubst(
        subst,
        visit(node, applySubstContext(subst, blockContext)).subst
      );
    }, emptySubst());

    return pathData(composedSubst, types.voidT());
  },
  ObjectExpression(path, state = emptyState()) {
    const obj = path.node.properties.reduce(
      ({ subst, type }, prop, i) => {
        path.traverse(visitor, {
          ...state,
          context: applySubstContext(subst, state.context),
          skip: p => p.node !== prop
        });
        const { subst: objSubst, type: tyObj } = path.get(
          `properties.${i}`
        ).data;
        const [[key, tyValue]] = tyObj.properties;
        let composedSubst = composeSubst(subst, objSubst);
        // merge each obj prop type into this obj type
        return {
          subst: composedSubst,
          type: state.types.objT([...type.properties, [key, tyValue]])
        };
      },
      { subst: emptySubst(), type: state.types.objT([]) }
    );

    path.data = pathData(obj.subst, obj.type);
    path.skip();
  },
  ObjectProperty(path, state = emptyState()) {
    // infer value
    path.traverse(visitor, {
      ...state,
      skip: p => p.node === path.node.key
    });
    const { subst: valSubst, type: tyVal } = path.get("value").data;
    // infer key
    path.traverse(visitor, {
      ...state,
      context: applySubstContext(
        valSubst,
        Object.assign(state.context, {
          [path.node.key.name]: createScheme([], state.types.varT())
        })
      ),
      skip: p => p.node === path.node.value
    });
    const { subst: keySubst, type: tyKey } = path.get("key").data;

    const subst = unify(applySubst(keySubst, tyKey), tyVal);

    path.data = pathData(
      subst,
      state.types.objT([[path.node.key.name, applySubst(subst, tyKey)]])
    );
    nodes[getId(path.node.key)].type = applySubst(subst, tyKey);
    path.skip();
  },
  StringLiteral(path, state = emptyState()) {
    path.data = pathData(emptySubst(), state.types.strT());
    nodes[getId(path.node)] = {
      node: path.node,
      ...path.data
    };
  },
  VariableDeclarator(path, context, { visit, types }) {
    // console.log("VariableDeclarator");
    // infer rhs
    const { subst: rhsSubst, type: tyRhs } = visit(path.node.init, context);
    // infer lhs
    const { subst: lhsSubst, type: tyLhs } = visit(
      path.node.id,
      applySubstContext(rhsSubst, context)
    );

    const subst = unify(applySubst(lhsSubst, tyLhs), tyRhs);
    return pathData(subst, types.voidT());
  }
};
