# MyBookingDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **number** |  | [default to undefined]
**locationId** | **number** |  | [default to undefined]
**locationName** | **string** |  | [default to undefined]
**status** | **string** |  | [default to undefined]
**createdDate** | **string** |  | [default to undefined]
**scheduledStart** | **string** |  | [default to undefined]
**scheduledEnd** | **string** |  | [default to undefined]
**totalPrice** | **number** |  | [default to undefined]
**treatmentCount** | **number** |  | [default to undefined]
**treatmentNames** | **Array&lt;string&gt;** |  | [default to undefined]
**appointmentStatusId** | **number** |  | [optional] [default to undefined]
**appointmentStatusName** | **string** |  | [optional] [default to undefined]
**appointmentStatusColorHex** | **string** |  | [optional] [default to undefined]
**cancelReasonId** | **number** |  | [optional] [default to undefined]
**cancelReasonName** | **string** |  | [optional] [default to undefined]
**isPaid** | **boolean** |  | [optional] [default to false]
**paymentProvider** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { MyBookingDto } from './api';

const instance: MyBookingDto = {
    id,
    locationId,
    locationName,
    status,
    createdDate,
    scheduledStart,
    scheduledEnd,
    totalPrice,
    treatmentCount,
    treatmentNames,
    appointmentStatusId,
    appointmentStatusName,
    appointmentStatusColorHex,
    cancelReasonId,
    cancelReasonName,
    isPaid,
    paymentProvider,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
