import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Yjs 바이너리 데이터를 Base64 문자열로 저장하기 위해 text 타입 사용
  // (실제 프로덕션에서는 bytea 타입을 쓰기도 함)
  @Column({ type: 'text' })
  content: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
