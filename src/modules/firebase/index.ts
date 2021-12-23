import firebase from "./lib";
import { firestore } from "firebase-admin";
import { hashCreate } from "../../functions";

/* 
  Firestore Generic Operations Functions
*/

interface FirestoreDocument {
    data?: any,
    snapshot?: any,
    collection?: any,
    ref?: any,
    db?: firestore.Firestore | null,
    error?: any
  }


interface FirestoreDocumentSetOperation extends FirestoreDocument {
    result?: any
    commit?: () => any
}

function generatePsudoIds(total = 10) {
    let ids = []; 
    for (let i = 0; i < total; i += 1) {
        const _id = hashCreate(i.toString())
        ids.push("0x0000" + _id.substring(_id.length - 32) + "0000")
    };
    return ids
}

export function testSendNotificationToFirestore() {
    const message = "eee"
    const content = { message }
    const timestamp = new Date().getTime()
    // const target = "0x15b0e6d785f3eedf32b3b8d7abcb7e6001e18dc5"
    const targets: string[] = [
        '0x15b0e6d785f3eedf32b3b8d7abcb7e6001e18dc5',
        ...generatePsudoIds(10)
    ]
    console.log("testSendNotificationToFirestore")
    
    // setFirestoreDocument(firebase.db, "dev", "test", { content }).then().catch()
    // setFirestoreDocument(firebase.db, "notification_pool", hash, { content }).then().catch()
    // setFirestoreDocument(firebase.db, "notification:list", target , { hash, list: firestore.FieldValue.arrayUnion({ hash }) }, { merge: true }).then().catch()
    
    setFirestoreDocument(firebase.db, "dev", "test", { content }).then().catch()

    setNotifications(targets, timestamp, content).then().catch()
}

export function setNotificationsToFirestore(targets: any[], content: any) {
    const timestamp = new Date().getTime()

    console.log("CHECK: setNotificationsToFirestore", targets, content)
    setNotifications(targets, timestamp, content).then().catch()
}

export async function setNotifications(target: string[], timestamp: number, content: any) {

    const hash = hashCreate(JSON.stringify(content))
    await setFirestoreDocument(firebase.db, "notification_pool", hash, { content }, { firestore: { merge: true }})
    
    const commit = await setWriteParallelFirestoreDocuments(firebase.db, "notification:list", target, { hash, list: firestore.FieldValue.arrayUnion(hash),  })
    await commit()
}
  
async function setFirestoreDocument(db: any, targetCollection: string, targetDocument: string, data: any, options?: any) {
    let doc: FirestoreDocumentSetOperation = {};
  
    try {
      if (!db) {}
      doc.db = firebase.firestore();
      doc.collection = doc.db.collection(targetCollection);
      doc.ref = doc.collection.doc(targetDocument);
  
      doc.data = { ...data };
      if (options.stale) {
        doc.commit = doc.ref.set(doc.data, { ...options.firestore });
      } else {
        doc.result = await doc.ref.set(doc.data, { ...options.firestore });
      }
  
    } catch (error) {
      doc.error = error;
    } finally {
      return doc
    }
}

async function setWriteParallelFirestoreDocuments(db: any, collection: string, docIDs: string[], content: any) {
    const batchSet: any[] = []
    let batch: any[] = []
    let count = 0

    for (const _id of docIDs) {
        if (count < 500) {
            batch.push(setFirestoreDocument(db, collection, _id, content, { stale: true, firestore: { merge: true } }))
            count += 1
        } else {
            batchSet.push(batch)
            batch = []
            count = 0
        }
    }
    
    return async function commit () {
        for (const _batch of batchSet) {
            await Promise.all(_batch)
        }
    }
}