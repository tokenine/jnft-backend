import * as firebaseAdmin from "firebase-admin";
// import * as configs from "../../configs";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount)
});

const firestore = firebaseAdmin.firestore;
// const FieldValue = firestore.FieldValue;

export default {
  firebase: firebaseAdmin,
  firestore,
  db: firestore()
  // db,
  // FieldValue,
  // configs
};

export { firebaseAdmin as firebase };
export { firestore };
export { firestore as db };
