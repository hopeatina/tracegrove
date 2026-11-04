# Explicit anonymous flows

A public browser flow can declare `as: none` at flow level. When every selected
flow makes that declaration, the compiler uses the existing `none` credential
recipe. It does not resolve, invent or attach a campaign bearer. HTTP steps
inherit that anonymous default; an explicit step-level persona still requires
its declared credential and never silently downgrades to anonymous.

Missing credentials are not treated as anonymous intent. Flows without this
declaration keep their existing authentication requirements. Selecting an
anonymous browser together with authenticated campaign defaults fails closed;
select separate campaigns instead. Existing environment agent policy,
production observation restrictions and network/method boundaries are unchanged.

```yaml
title: Public pricing changes its term
as: none
browser:
  allowPaths: [/pricing, /assets]
  allowMethods: [GET, HEAD]
steps:
  - browser: { kind: navigate, path: /pricing }
    expect: { status: 200 }
  - browser: { kind: read, target: { by: testId, name: plan-price-starter } }
    expect: { text: "$98" }
```

This is a source fix pending normal qualification and a new patch release.
Published0.6.0 and its immutable tag remain unchanged. No identity, approval,
production endpoint or credential is created by compiling this declaration.
