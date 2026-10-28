
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "absence_excuses": {
                  Row: {
                    "created_at": string,"details": string | null,"from_date": string,"id": string,"reason_type": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"student_id": string,"submitted_by": string | null,"to_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"from_date": string,"id"?: string,"reason_type": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"student_id": string,"submitted_by"?: string | null,"to_date": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"from_date"?: string,"id"?: string,"reason_type"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"student_id"?: string,"submitted_by"?: string | null,"to_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "absence_excuses_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "absence_excuses_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "absence_excuses_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"academic_years": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"is_current": boolean,"name": string,"starts_on": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"is_current"?: boolean,"name": string,"starts_on": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"is_current"?: boolean,"name"?: string,"starts_on"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"attendance_corrections": {
                  Row: {
                    "corrected_at": string,"corrected_by": string | null,"id": string,"new_status": string,"old_status": string | null,"reason": string,"record_id": string | null,"session_id": string,"source": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "corrected_at"?: string,"corrected_by"?: string | null,"id"?: string,"new_status": string,"old_status"?: string | null,"reason": string,"record_id"?: string | null,"session_id": string,"source"?: string,"student_id": string
                  }
                  Update: {
                    "corrected_at"?: string,"corrected_by"?: string | null,"id"?: string,"new_status"?: string,"old_status"?: string | null,"reason"?: string,"record_id"?: string | null,"session_id"?: string,"source"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_corrections_corrected_by_fkey"
      columns: ["corrected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_corrections_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "attendance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_corrections_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "attendance_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_corrections_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_records": {
                  Row: {
                    "created_at": string,"enrollment_id": string,"id": string,"minutes_late": number | null,"note": string | null,"recorded_by": string | null,"session_id": string,"status": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enrollment_id": string,"id"?: string,"minutes_late"?: number | null,"note"?: string | null,"recorded_by"?: string | null,"session_id": string,"status": string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"enrollment_id"?: string,"id"?: string,"minutes_late"?: number | null,"note"?: string | null,"recorded_by"?: string | null,"session_id"?: string,"status"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "attendance_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_sessions": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"period": number,"reopen_reason": string | null,"reopened_at": string | null,"reopened_by": string | null,"session_date": string,"status": string,"submitted_at": string | null,"submitted_late": boolean,"taken_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"period"?: number,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"session_date": string,"status"?: string,"submitted_at"?: string | null,"submitted_late"?: boolean,"taken_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"period"?: number,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"session_date"?: string,"status"?: string,"submitted_at"?: string | null,"submitted_late"?: boolean,"taken_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_sessions_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "school_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_sessions_reopened_by_fkey"
      columns: ["reopened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_sessions_taken_by_fkey"
      columns: ["taken_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": Json | null,"created_at": string,"id": number,"reason": string | null,"record_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"id"?: never,"reason"?: string | null,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"id"?: never,"reason"?: string | null,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"behavior_categories": {
                  Row: {
                    "created_at": string,"default_severity": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_severity"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_severity"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"behavior_incidents": {
                  Row: {
                    "category_id": string,"created_at": string,"decision_note": string | null,"description": string,"id": string,"incident_date": string,"location": string | null,"reported_by": string | null,"resolved_at": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"severity": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"decision_note"?: string | null,"description": string,"id"?: string,"incident_date": string,"location"?: string | null,"reported_by"?: string | null,"resolved_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"decision_note"?: string | null,"description"?: string,"id"?: string,"incident_date"?: string,"location"?: string | null,"reported_by"?: string | null,"resolved_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "behavior_incidents_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "behavior_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "behavior_incidents_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "behavior_incidents_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "academic_year_id": string,"class_id": string,"created_at": string,"ended_on": string | null,"enrolled_on": string,"id": string,"status": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"class_id": string,"created_at"?: string,"ended_on"?: string | null,"enrolled_on"?: string,"id"?: string,"status"?: string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"class_id"?: string,"created_at"?: string,"ended_on"?: string | null,"enrolled_on"?: string,"id"?: string,"status"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_class_year_fk"
      columns: ["class_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "school_classes"
      referencedColumns: ["id","academic_year_id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"follow_up_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"task_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_up_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_notes_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "follow_up_tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"follow_up_tasks": {
                  Row: {
                    "assigned_to": string,"category": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"due_soon_notified_at": string | null,"id": string,"incident_id": string | null,"outcome": string | null,"priority": string,"status": string,"student_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to": string,"category"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"due_soon_notified_at"?: string | null,"id"?: string,"incident_id"?: string | null,"outcome"?: string | null,"priority"?: string,"status"?: string,"student_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string,"category"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"due_soon_notified_at"?: string | null,"id"?: string,"incident_id"?: string | null,"outcome"?: string | null,"priority"?: string,"status"?: string,"student_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_up_tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_tasks_incident_id_fkey"
      columns: ["incident_id"]
isOneToOne: false
      referencedRelation: "behavior_incidents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_tasks_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"incident_actions": {
                  Row: {
                    "action_type": string,"actor_id": string | null,"created_at": string,"from_status": string | null,"id": string,"incident_id": string,"note": string | null,"to_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action_type": string,"actor_id"?: string | null,"created_at"?: string,"from_status"?: string | null,"id"?: string,"incident_id": string,"note"?: string | null,"to_status"?: string | null
                  }
                  Update: {
                    "action_type"?: string,"actor_id"?: string | null,"created_at"?: string,"from_status"?: string | null,"id"?: string,"incident_id"?: string,"note"?: string | null,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "incident_actions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incident_actions_incident_id_fkey"
      columns: ["incident_id"]
isOneToOne: false
      referencedRelation: "behavior_incidents"
      referencedColumns: ["id"]
    }
                  ]
                },"incident_students": {
                  Row: {
                    "incident_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "incident_id": string,"student_id": string
                  }
                  Update: {
                    "incident_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incident_students_incident_id_fkey"
      columns: ["incident_id"]
isOneToOne: false
      referencedRelation: "behavior_incidents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incident_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"is_read": boolean,"link": string | null,"read_at": string | null,"recipient_id": string,"title": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"is_read"?: boolean,"link"?: string | null,"read_at"?: string | null,"recipient_id": string,"title": string,"type": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"is_read"?: boolean,"link"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"school_classes": {
                  Row: {
                    "academic_year_id": string,"capacity": number | null,"created_at": string,"grade_level": number,"id": string,"is_archived": boolean,"name": string,"room": string | null,"section": string,"track": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"capacity"?: number | null,"created_at"?: string,"grade_level": number,"id"?: string,"is_archived"?: boolean,"name": string,"room"?: string | null,"section": string,"track"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"capacity"?: number | null,"created_at"?: string,"grade_level"?: number,"id"?: string,"is_archived"?: boolean,"name"?: string,"room"?: string | null,"section"?: string,"track"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_classes_academic_year_id_fkey"
      columns: ["academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["id"]
    }
                  ]
                },"school_settings": {
                  Row: {
                    "attendance_mode": string,"follow_up_due_soon_days": number,"id": number,"periods_per_day": number,"school_name_ar": string,"school_name_en": string,"teacher_backdate_days": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_mode"?: string,"follow_up_due_soon_days"?: number,"id"?: number,"periods_per_day"?: number,"school_name_ar"?: string,"school_name_en"?: string,"teacher_backdate_days"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "attendance_mode"?: string,"follow_up_due_soon_days"?: number,"id"?: number,"periods_per_day"?: number,"school_name_ar"?: string,"school_name_en"?: string,"teacher_backdate_days"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"students": {
                  Row: {
                    "created_at": string,"date_of_birth": string | null,"full_name": string,"guardian_name": string | null,"guardian_phone": string | null,"id": string,"notes": string | null,"status": string,"student_number": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date_of_birth"?: string | null,"full_name": string,"guardian_name"?: string | null,"guardian_phone"?: string | null,"id"?: string,"notes"?: string | null,"status"?: string,"student_number": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date_of_birth"?: string | null,"full_name"?: string,"guardian_name"?: string | null,"guardian_phone"?: string | null,"id"?: string,"notes"?: string | null,"status"?: string,"student_number"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"teacher_class_assignments": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"is_homeroom": boolean,"subject": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"is_homeroom"?: boolean,"subject"?: string,"teacher_id": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"is_homeroom"?: boolean,"subject"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_class_assignments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "school_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_class_assignments_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_incident_action":
{ Args: { "p_incident_id": string,"p_note": string,"p_type": string }; Returns: undefined
                           },
"ar_normalize":
{ Args: { "p": string }; Returns: string
                           },
"attendance_rate":
{ Args: { "p_absent": number,"p_excused": number,"p_late": number,"p_present": number }; Returns: number
                           },
"attendance_student_summary":
{ Args: { "p_class_id"?: string,"p_from": string,"p_student_id"?: string,"p_to": string }; Returns: {
              "absent": number,"class_id": string,"class_name": string,"excused": number,"full_name": string,"late": number,"present": number,"rate": number,"student_id": string,"student_number": string,"total_marked": number
            }[]
                           },
"attendance_trend":
{ Args: { "p_class_id"?: string,"p_from": string,"p_to": string }; Returns: {
              "absent": number,"day": string,"excused": number,"late": number,"present": number,"rate": number
            }[]
                           },
"can_view_student":
{ Args: { "_student_id": string }; Returns: boolean
                           },
"class_attendance_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "absent": number,"class_id": string,"class_name": string,"enrolled": number,"excused": number,"grade_level": number,"late": number,"present": number,"rate": number,"sessions": number,"sessions_submitted": number
            }[]
                           },
"class_roster":
{ Args: { "p_class_id": string,"p_date": string }; Returns: {
              "enrollment_id": string,"full_name": string,"student_id": string,"student_number": string
            }[]
                           },
"create_student":
{ Args: { "p_class_id": string,"p_date_of_birth": string,"p_full_name": string,"p_guardian_name": string,"p_guardian_phone": string,"p_notes": string,"p_student_number": string }; Returns: string
                           },
"current_academic_year_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dashboard_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"enroll_student":
{ Args: { "p_class_id": string,"p_date"?: string,"p_student_id": string }; Returns: string
                           },
"follow_up_summary":
{ Args: Record<PropertyKey, never>; Returns: {
              "assignee_id": string,"assignee_name": string,"cancelled": number,"completed": number,"in_progress": number,"open": number,"overdue": number
            }[]
                           },
"has_role":
{ Args: { "_role": string }; Returns: boolean
                           },
"in_trusted_context":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"incident_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "category_id": string,"category_name": string,"incidents": number,"status": string
            }[]
                           },
"incident_transition_allowed":
{ Args: { "p_from": string,"p_to": string }; Returns: boolean
                           },
"is_active_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"kw_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"notify":
{ Args: { "_body": string,"_link": string,"_recipient": string,"_title": string,"_type": string }; Returns: undefined
                           },
"notify_managers":
{ Args: { "_body": string,"_link": string,"_title": string,"_type": string }; Returns: undefined
                           },
"refresh_due_soon_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reopen_attendance_session":
{ Args: { "p_reason": string,"p_session_id": string }; Returns: undefined
                           },
"require_staff":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"review_absence_excuse":
{ Args: { "p_decision": string,"p_excuse_id": string,"p_note"?: string }; Returns: number
                           },
"save_attendance":
{ Args: { "p_class_id": string,"p_date": string,"p_period": number,"p_reason"?: string,"p_records": Json,"p_submit"?: boolean }; Returns: string
                           },
"search_students":
{ Args: { "p_class_id"?: string,"p_grade"?: number,"p_limit"?: number,"p_offset"?: number,"p_search"?: string,"p_status"?: string,"p_year_id"?: string }; Returns: {
              "academic_year_id": string,"class_id": string,"class_name": string,"enrollment_id": string,"enrollment_status": string,"full_name": string,"grade_level": number,"guardian_phone": string,"id": string,"status": string,"student_number": string,"total_count": number
            }[]
                           },
"set_student_status":
{ Args: { "p_reason"?: string,"p_status": string,"p_student_id": string }; Returns: undefined
                           },
"submit_incident":
{ Args: { "p_category_id": string,"p_description": string,"p_incident_date": string,"p_location": string,"p_severity": string,"p_student_ids": (string)[] }; Returns: string
                           },
"teaches_class":
{ Args: { "_class_id": string }; Returns: boolean
                           },
"teaches_student":
{ Args: { "_student_id": string }; Returns: boolean
                           },
"transition_incident":
{ Args: { "p_incident_id": string,"p_note"?: string,"p_to_status": string }; Returns: undefined
                           },
"write_audit":
{ Args: { "_action": string,"_changes": Json,"_reason"?: string,"_record": string,"_table": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
