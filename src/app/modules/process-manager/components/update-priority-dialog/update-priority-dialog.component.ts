import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-update-priority-dialog',
  templateUrl: './update-priority-dialog.component.html',
})
export class UpdatePriorityDialogComponent implements OnInit {
  processForm: FormGroup;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: number,
    public dialogRef: MatDialogRef<UpdatePriorityDialogComponent>,
    private formBuilder: FormBuilder
  ) {
    this.processForm = this.formBuilder.group({
      priority: [data, [Validators.min(0), Validators.max(15)]],
    });
  }

  ngOnInit() {}

  onClose() {
    this.dialogRef.close();
  }

  onSubmit() {
    this.dialogRef.close(this.processForm.get('priority')?.value);
  }
}
