import styles from './SkeletonMessage.module.css';

export function SkeletonMessage() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonAvatar} />
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonLine} style={{ width: '80%' }} />
        <div className={styles.skeletonLine} style={{ width: '60%' }} />
        <div className={styles.skeletonLine} style={{ width: '40%' }} />
      </div>
    </div>
  );
}

export function SkeletonMessageList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonMessage key={i} />
      ))}
    </>
  );
}
