import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import {
  FormValidationIssue,
  validationIssueIdentity,
} from '../models/form-validation';

@Injectable({ providedIn: 'root' })
export class FormValidationOrchestratorService {
  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  mapByIdentity(
    issues: readonly FormValidationIssue[],
  ): Record<string, string> {
    return Object.fromEntries(
      issues.map((issue) => [validationIssueIdentity(issue), issue.message]),
    );
  }

  groupBySection(
    issues: readonly FormValidationIssue[],
  ): Record<string, FormValidationIssue[]> {
    return [...issues]
      .sort((left, right) => left.order - right.order)
      .reduce<Record<string, FormValidationIssue[]>>((groups, issue) => {
        (groups[issue.section] ??= []).push(issue);
        return groups;
      }, {});
  }

  markAttempt(form: FormGroup): void {
    form.markAllAsTouched();
  }

  clearIssue(
    issues: readonly FormValidationIssue[],
    key: string,
    referenceName?: string,
  ): FormValidationIssue[] {
    const identity = referenceName ? `${key}:${referenceName}` : key;
    return issues.filter(
      (issue) => validationIssueIdentity(issue) !== identity,
    );
  }

  focusFirst(issues: readonly FormValidationIssue[]): void {
    const first = [...issues].sort(
      (left, right) => left.order - right.order,
    )[0];
    if (!first?.controlId) return;

    requestAnimationFrame(() => {
      const target = this.document.getElementById(first.controlId);
      if (!target) return;
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
      target.focus({ preventScroll: true });
    });
  }
}
