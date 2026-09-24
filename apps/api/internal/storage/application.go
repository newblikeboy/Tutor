package storage

import "go.mongodb.org/mongo-driver/v2/bson"

func applicationProfileSchema() bson.M {
	return bson.M{"bsonType": "object", "required": []string{"schemaVersion", "about", "education", "teachingAreas", "availability", "approach", "fees", "declarations"}, "properties": bson.M{
		"schemaVersion": bson.M{"enum": []int{1}},
		"about":         bson.M{"bsonType": "object"}, "education": bson.M{"bsonType": "object"},
		"teachingAreas": bson.M{"bsonType": "array", "maxItems": 8, "items": bson.M{"bsonType": "object", "required": []string{"id", "subject", "minClass", "maxClass", "modes", "boards", "languages"}, "properties": bson.M{
			"modes":     bson.M{"bsonType": "array", "maxItems": 2, "uniqueItems": true, "items": bson.M{"enum": []string{"home", "online"}}},
			"boards":    bson.M{"bsonType": "array", "maxItems": 3, "uniqueItems": true, "items": bson.M{"enum": []string{"CBSE", "BSEB", "ICSE"}}},
			"languages": bson.M{"bsonType": "array", "maxItems": 2, "uniqueItems": true, "items": bson.M{"enum": []string{"Hindi", "English"}}},
		}}},
		"availability": bson.M{"bsonType": "object", "properties": bson.M{"slots": bson.M{"bsonType": "array", "maxItems": 21}, "timezone": bson.M{"enum": []string{"Asia/Kolkata"}}}},
		"approach":     bson.M{"bsonType": "object"}, "fees": bson.M{"bsonType": "object"}, "declarations": bson.M{"bsonType": "object"},
	}}
}
