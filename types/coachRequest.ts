export interface CoachRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentAvatar?: string | null;
  coachId: string;
  goal: string;
  monthlyBudget?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}
