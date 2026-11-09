import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DropdownCoordinatorService {
  private readonly activeDropdownIdSubject = new BehaviorSubject<string | null>(
    null,
  );
  readonly activeDropdownId$ = this.activeDropdownIdSubject.asObservable();

  get activeDropdownId(): string | null {
    return this.activeDropdownIdSubject.value;
  }

  open(dropdownId: string): void {
    this.activeDropdownIdSubject.next(dropdownId);
  }

  close(dropdownId?: string): void {
    if (!dropdownId || this.activeDropdownId === dropdownId) {
      this.activeDropdownIdSubject.next(null);
    }
  }
}
