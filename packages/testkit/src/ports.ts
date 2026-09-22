export type EvidenceClass="fixture"|"local-runtime"|"live-provider"|"deployed-end-to-end";
export interface ClockPort{virtualElapsedSeconds():number;wallElapsedSeconds():number;advanceVirtual(seconds:number):void}
export interface ModelPort{complete(input:unknown):Promise<unknown>} export interface GraphPort{query(name:string,input:unknown):Promise<unknown>} export interface ProjectionPort{persist(input:unknown):Promise<unknown>} export interface ActionPort{execute(input:unknown):Promise<unknown>}
export interface DomainPorts{clock:ClockPort;model:ModelPort;graph:GraphPort;projection:ProjectionPort;actions:ActionPort}
