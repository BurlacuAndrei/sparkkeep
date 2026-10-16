# 06: Non-Destructive Card Taxonomy Cascade in Platform Settings

**What to build:**
When deleting a user-defined Card Type in Settings that is referenced by playbooks, an impact confirmation dialog lists the affected playbooks. Confirming the default "Detach" action automatically batch-updates those playbooks to strip the deleted type tag via the API while keeping the playbooks completely intact and safe.

**Blocked by:** 01: Top-Level Playbook Studio Workspace Navigation & Full-Width Canvas

**Status:** ready-for-agent

- [ ] Inspect loaded playbooks when a user clicks delete on a Card Type chip in Settings.
- [ ] If playbooks reference the type, display an impact confirmation dialog showing the affected playbooks.
- [ ] Provide "Detach from Playbooks (Default)" and "Cancel" actions.
- [ ] On confirmation, dispatch API update calls to remove the deleted card type from each affected playbook, and update settings.
- [ ] Tests verify the impact dialog appears, affected playbooks are listed, and batch updates are dispatched without deleting playbooks.
