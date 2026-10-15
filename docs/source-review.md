# Source-backed plan review

`validatePlanSources` checks a sealed source plan against its exact change model and revision matrix. It authorizes each repository, hashes the fetched full diff, resolves citations only at selected immutable commits, and reuses `verifySourceCitation` for file/excerpt checks. A modified working checkout cannot substitute for unavailable selected source.

Runnable derivations need confirmed metadata, citations, and nonempty evidence from a registered independent AST/schema/route oracle. Confidence and a proposed `confirmed` label do not establish that evidence. Failed/partial/unsupported extraction retains diagnostic refs as plan gaps. The trusted coverage policy checks frozen requirements, unresolved questions, excluded material and no-E2E reasoning. Source checks never produce runtime PASS, qualification or activation.

Trusted host integration:

```ts
const reviewPorts: PlanReviewPorts = {
  ...authenticatedReviewAndStorage,
  validateSources: (plan, policyRef) => validatePlanSources(sourcePorts, plan, policyRef),
};
const reviewed = await reviewPlan(reviewPorts, revisionToken, 'approved', reasonRefs);
```

All ports belong to the authenticated host. A candidate, plugin or authoring model cannot supply its own source checker, oracle or coverage policy. Revision policy must explicitly admit a missing merge base and its alternative diff method. A full diff over 4 MiB, over 500 distinct runnable citations, unavailable objects, mismatched refs or denied authority block validation rather than truncate source.

Approval requires a sealed `workflow.source-validation/v1` result binding the same plan, change model, matrix, scope and admitted review policy. Its ref is included in the immutable review's reason refs. The host's `compareAndSwap` must publish that validation record, review and projection in one atomic write. A losing write publishes none of them. Rejection requires no fabricated successful source check. An edit still clears the current review; historical validation records remain evidence of their original source digests.

This changes the experimental `PlanReviewPorts` contract: approved reviews require `validateSources`, and `compareAndSwap` receives a fourth validation argument. Persist it atomically; ignoring it is not a conforming host. No hosted source registry, review store, production oracle or execution admission adapter is installed by this API. Qualification and regression requests remain blocked by the existing executor until their lifecycle authority is implemented.
