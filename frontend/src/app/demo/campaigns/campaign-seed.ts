import {UserRole} from '../../domain/user/user-role';
import {CampaignActivation,CampaignApproval,CampaignCurrency,CampaignRevisionStatus} from './campaign-types';
import type {DemoCampaignRecord} from './campaign-record';
export class SeedCampaignRecordsStep {
 execute():DemoCampaignRecord[]{
  const titles=['Selección editorial de herramientas','Preparación de campaña de taller','Organización en pausa','Selección de septiembre','Vigencia para corregir','Registro sin estado reconocido'];
  const scopes=[['DEMO-001','DEMO-002'],['DEMO-001','DEMO-004'],['DEMO-010'],['DEMO-006'],['DEMO-003'],['DEMO-005']];
  const starts=['2026-10-01','2026-10-16','2026-10-01','2026-09-01','2026-10-20','2026-10-01'],ends=['2026-11-01','2026-11-01','2026-11-01','2026-10-01','2026-10-10','2026-11-01'];
  const approvals=['2026-10-01T09:00:00-03:00','2026-10-15T10:00:00-03:00','2026-10-01T08:30:00-03:00','2026-09-01T08:00:00-03:00'];
  return titles.map((title,index)=>{const id='CMP-DEMO-'+String(index+1).padStart(3,'0');return{id,familyId:id,revision:1,revisesId:null,revisionStatus:index===5?CampaignRevisionStatus.Unknown:index===4?CampaignRevisionStatus.Candidate:CampaignRevisionStatus.Current,title,skus:scopes[index],currency:CampaignCurrency.ARS,activation:index===5?CampaignActivation.Unknown:index===2?CampaignActivation.Paused:CampaignActivation.Enabled,approval:index===5?CampaignApproval.Unknown:index===4?CampaignApproval.Draft:CampaignApproval.Approved,startsAt:starts[index]+'T00:00:00-03:00',endsAt:ends[index]+'T00:00:00-03:00',priority:700-index*100,declaredMarginBps:[1500,1200,1000,800,500,0][index],approvalMetadata:index<4?{actorId:index<2?'fixture-admin-01':'fixture-admin-02',role:UserRole.Admin,approvedAt:approvals[index]}:null};});
 }
}
